// Pure portfolio backtest engine. No DOM, state, i18n, or local-timezone helpers:
// dates are 'YYYY-MM-DD' strings and compared lexically.

export const REBALANCE_MODES = ['none', 'monthly', 'quarterly', 'yearly'];

// Days of slack before a late first data point counts as "listed later than requested".
const LATE_START_TOLERANCE_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * @param {object} input
 * @param {{key?: string, weight: number, cash?: boolean}[]} input.assets  weights in percent or fractions; normalised internally.
 *        A `cash: true` asset has a constant price of 1 and needs no key or price series.
 * @param {Record<string, [string, number][]>} input.prices  ascending [date, value] per asset key
 * @param {string} input.start  requested start date (inclusive)
 * @param {string} input.end    requested end date (inclusive)
 * @param {number} input.initialAmount
 * @param {'none'|'monthly'|'quarterly'|'yearly'} input.rebalance
 */
export function runBacktest({ assets, prices, start, end, initialAmount, rebalance = 'none' }) {
    if (!Array.isArray(assets) || assets.length === 0) throw new BacktestError('noAssets');
    if (!REBALANCE_MODES.includes(rebalance)) throw new BacktestError('badRebalance');

    const totalWeight = assets.reduce((sum, asset) => sum + asset.weight, 0);
    if (!(totalWeight > 0)) throw new BacktestError('noAssets');
    const weights = assets.map(asset => asset.weight / totalWeight);

    // Cash has a constant price of 1 and no series. It adds no trading dates and does not
    // limit the period, so only priced assets take part in the start and end checks below.
    const pricedIndexes = assets.map((asset, index) => index).filter(index => !assets[index].cash);
    if (pricedIndexes.length === 0) throw new BacktestError('noAssets');

    // Each priced asset keeps its in-range points plus, when available, the last value before
    // `start` as a carry-in. The carry-in lets a later, shared start date (used to align
    // several portfolios) price an asset that has no point on exactly that day.
    const seriesList = pricedIndexes.map(index => {
        const asset = assets[index];
        const all = (prices[asset.key] || []).filter(([date, value]) => date <= end && value > 0);
        const firstInRange = all.findIndex(([date]) => date >= start);
        if (firstInRange === -1) throw new BacktestError('noData', { key: asset.key });
        return {
            points: all.slice(firstInRange),
            carry: firstInRange > 0 ? all[firstInRange - 1][1] : null
        };
    });

    const firstDates = seriesList.map(({ points, carry }) => (carry !== null ? start : points[0][0]));
    const lastDates = seriesList.map(({ points }) => points[points.length - 1][0]);
    const startBound = maxDate(firstDates);
    const effectiveEnd = minDate(lastDates);
    if (startBound >= effectiveEnd) throw new BacktestError('noOverlap');

    const lateAssets = pricedIndexes
        .filter((assetIndex, k) => daysBetween(start, firstDates[k]) > LATE_START_TOLERANCE_DAYS
            && firstDates[k] === startBound)
        .map(assetIndex => assets[assetIndex].key);

    const calendar = buildCalendar(seriesList.map(item => item.points), startBound, effectiveEnd);
    if (calendar.length < 2) throw new BacktestError('noOverlap');
    const effectiveStart = calendar[0];
    // One price column per asset, in the original asset order; cash stays at 1.
    const priceMatrix = assets.map(asset => (asset.cash ? calendar.map(() => 1) : null));
    pricedIndexes.forEach((assetIndex, k) => {
        priceMatrix[assetIndex] = forwardFill(seriesList[k].points, calendar, seriesList[k].carry);
    });

    const dates = [];
    const values = [];
    const rebalanceDates = [];
    let units = null;
    let previousPeriod = null;

    calendar.forEach((date, dayIndex) => {
        const dayPrices = priceMatrix.map(column => column[dayIndex]);
        const period = periodKey(date, rebalance);

        if (units === null) {
            units = weights.map((weight, i) => (initialAmount * weight) / dayPrices[i]);
        } else if (period !== null && period !== previousPeriod) {
            const total = portfolioValue(units, dayPrices);
            units = weights.map((weight, i) => (total * weight) / dayPrices[i]);
            rebalanceDates.push(date);
        }
        previousPeriod = period;

        dates.push(date);
        values.push(portfolioValue(units, dayPrices));
    });

    const firstPrices = priceMatrix.map(column => column[0]);
    const lastPrices = priceMatrix.map(column => column[column.length - 1]);
    const lastValue = values[values.length - 1];

    // effectiveStart is the first trading day actually simulated (a carry-in can make
    // the requested start valid even when it is a weekend or holiday).
    return {
        dates,
        values,
        nav: values.map(value => value / initialAmount),
        rebalanceDates,
        effectiveStart,
        effectiveEnd,
        lateAssets,
        startWeights: weights,
        endWeights: units.map((unit, i) => (unit * lastPrices[i]) / lastValue),
        assetReturns: lastPrices.map((price, i) => price / firstPrices[i] - 1)
    };
}

export class BacktestError extends Error {
    constructor(code, detail = {}) {
        super(code);
        this.name = 'BacktestError';
        this.code = code;
        this.detail = detail;
    }
}

export function periodKey(date, mode) {
    const year = date.slice(0, 4);
    const month = Number(date.slice(5, 7));
    if (mode === 'monthly') return `${year}-${month}`;
    if (mode === 'quarterly') return `${year}-Q${Math.ceil(month / 3)}`;
    if (mode === 'yearly') return year;
    return null;
}

function buildCalendar(seriesList, from, to) {
    const dateSet = new Set();
    seriesList.forEach(points => {
        points.forEach(([date]) => {
            if (date >= from && date <= to) dateSet.add(date);
        });
    });
    return [...dateSet].sort();
}

// Aligns a series to the calendar, carrying the last known value over missing days
// (holidays that differ between markets, QDII funds, suspended stocks).
function forwardFill(points, calendar, initial = null) {
    const column = [];
    let pointer = 0;
    let last = initial;
    calendar.forEach(date => {
        while (pointer < points.length && points[pointer][0] <= date) {
            last = points[pointer][1];
            pointer += 1;
        }
        column.push(last);
    });
    return column;
}

function portfolioValue(units, dayPrices) {
    return units.reduce((sum, unit, i) => sum + unit * dayPrices[i], 0);
}

function maxDate(dates) {
    return dates.reduce((a, b) => (b > a ? b : a));
}

function minDate(dates) {
    return dates.reduce((a, b) => (b < a ? b : a));
}

function daysBetween(from, to) {
    return (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS;
}
