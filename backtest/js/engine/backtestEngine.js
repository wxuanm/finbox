// Pure portfolio backtest engine. No DOM, state, i18n, or local-timezone helpers:
// dates are 'YYYY-MM-DD' strings and compared lexically.

export const REBALANCE_MODES = ['none', 'monthly', 'quarterly', 'yearly'];

// Days of slack before a late first data point counts as "listed later than requested".
const LATE_START_TOLERANCE_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * @param {object} input
 * @param {{key: string, weight: number}[]} input.assets  weights in percent or fractions; normalised internally
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

    const seriesList = assets.map(asset => {
        const points = (prices[asset.key] || [])
            .filter(([date, value]) => date >= start && date <= end && value > 0);
        if (points.length === 0) throw new BacktestError('noData', { key: asset.key });
        return points;
    });

    const firstDates = seriesList.map(points => points[0][0]);
    const lastDates = seriesList.map(points => points[points.length - 1][0]);
    const effectiveStart = maxDate(firstDates);
    const effectiveEnd = minDate(lastDates);
    if (effectiveStart >= effectiveEnd) throw new BacktestError('noOverlap');

    const lateAssets = assets
        .filter((asset, index) => daysBetween(start, firstDates[index]) > LATE_START_TOLERANCE_DAYS
            && firstDates[index] === effectiveStart)
        .map(asset => asset.key);

    const calendar = buildCalendar(seriesList, effectiveStart, effectiveEnd);
    const priceMatrix = seriesList.map(points => forwardFill(points, calendar));

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
function forwardFill(points, calendar) {
    const column = [];
    let pointer = 0;
    let last = null;
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
