import { t } from '../../config/i18n.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_ANNUALIZED_DAYS = 30;

// Every account shares one period start, counted back from the latest snapshot across all calculable accounts.
// A lagging account therefore keeps the same window as the others, and per-account period P/L adds up to the
// portfolio's period P/L.
export function buildAccountMetrics(accounts, snapshots, periodKey) {
    const seriesResults = accounts.map(account => ({ account, result: buildAccountSeries(account, snapshots) }));
    const referenceDate = seriesResults.reduce((latest, { result }) => {
        const date = result.points?.[result.points.length - 1]?.date || '';
        return date > latest ? date : latest;
    }, '');
    const periodStartDate = getPeriodStartDate(referenceDate, periodKey);

    return seriesResults.map(({ account, result }) => {
        if (result.error) {
            return { account, valid: false, error: result.error, points: [] };
        }
        return { account, valid: true, ...summarizeSeries(result.points, periodStartDate) };
    });
}

// The portfolio is every calculable account treated as one account and run through the same share-based
// NAV as a single account. On each snapshot date its total value is the sum of each account's latest snapshot
// on or before that date, and its net flow is the sum of that day's net flows; an account's first snapshot
// counts as a flow of its whole value, except on the portfolio's first date where it forms the opening value.
// Returns null when no account is calculable.
export function buildPortfolioMetrics(metrics) {
    const valid = metrics.filter(metric => metric.valid && metric.points.length > 0);
    if (valid.length === 0) return null;

    const dates = [...new Set(valid.flatMap(metric => metric.points.map(point => point.date)))].sort();
    const cursors = valid.map(() => -1);
    const items = dates.map((date, dateIndex) => {
        let totalValue = 0;
        let netFlow = 0;
        valid.forEach((metric, accountIndex) => {
            const points = metric.points;
            let cursor = cursors[accountIndex];
            while (cursor + 1 < points.length && points[cursor + 1].date <= date) cursor += 1;
            cursors[accountIndex] = cursor;
            if (cursor < 0) return;
            const point = points[cursor];
            totalValue += point.totalValue;
            if (point.date !== date || dateIndex === 0) return;
            netFlow += cursor === 0 ? point.totalValue : point.netFlow;
        });
        return { date, totalValue, netFlow };
    });

    const result = buildSeriesFromItems(items);
    if (result.error) return null;
    const latestDate = dates[dates.length - 1];
    const periodStartDate = valid[0].periodStartDate;
    return {
        ...summarizeSeries(result.points, periodStartDate),
        accountCount: valid.length,
        syncedCount: valid.filter(metric => metric.latestDate === latestDate).length
    };
}

export function buildAccountSeries(account, snapshots) {
    const items = snapshots
        .filter(snapshot => snapshot.accountId === account.id)
        .map(normalizeSnapshot)
        .filter(Boolean)
        .sort((a, b) => a.date.localeCompare(b.date));
    return buildSeriesFromItems(items);
}

function summarizeSeries(points, periodStartDate) {
    const latestPoint = points[points.length - 1];
    const periodPoints = getPeriodPoints(points, periodStartDate);
    const anchorPoint = periodPoints[0];
    const periodReturn = anchorPoint ? (latestPoint.unitNav / anchorPoint.unitNav - 1) * 100 : null;
    const annualizedReturn = anchorPoint ? calculateAnnualizedReturn(anchorPoint, latestPoint) : null;
    const periodDrawdown = periodPoints.length > 1 ? calculateMaxDrawdown(periodPoints) : null;
    const volatility = periodPoints.length > 2 ? calculateAnnualizedVolatility(periodPoints) : null;
    const calmar = Number.isFinite(annualizedReturn) && Number.isFinite(periodDrawdown) && periodDrawdown < 0
        ? annualizedReturn / Math.abs(periodDrawdown)
        : null;
    const profitLoss = latestPoint.totalValue - latestPoint.netContribution;
    // Same definition as cumulative P/L: the change in (value - net contribution) since the period anchor.
    const periodProfitLoss = anchorPoint ? profitLoss - (anchorPoint.totalValue - anchorPoint.netContribution) : null;

    return {
        points,
        periodPoints,
        periodStartDate,
        latestDate: latestPoint.date,
        latestValue: latestPoint.totalValue,
        netContribution: latestPoint.netContribution,
        profitLoss,
        periodProfitLoss,
        cumulativeReturn: latestPoint.returnPct,
        periodReturn,
        annualizedReturn,
        maxDrawdown: periodDrawdown,
        annualizedVolatility: volatility,
        calmarRatio: calmar
    };
}

function buildSeriesFromItems(items) {
    if (items.length < 2) return { error: t('needTwoSnapshots') };
    if (items[0].totalValue <= 0) return { error: t('firstSnapshotPositive') };

    let unitNav = 1;
    let shares = items[0].totalValue;
    let netContribution = items[0].totalValue;
    const points = [buildPoint(items[0], unitNav, shares, netContribution, 0)];

    for (let index = 1; index < items.length; index += 1) {
        const item = items[index];
        const flowShares = item.netFlow / unitNav;
        shares += flowShares;
        netContribution += item.netFlow;

        if (shares <= 0) {
            return { error: t('flowSharesInvalid', { date: item.date }) };
        }

        unitNav = item.totalValue / shares;
        if (!Number.isFinite(unitNav) || unitNav <= 0) {
            return { error: t('unitNavInvalid', { date: item.date }) };
        }

        points.push(buildPoint(item, unitNav, shares, netContribution, (unitNav - 1) * 100));
    }

    return { points };
}

export function getPeriodStartDate(latestDate, periodKey) {
    const latest = parseDate(latestDate);
    if (!latest || periodKey === 'ALL') return '';

    const date = new Date(latest.getTime());
    if (periodKey === 'YTD') {
        return `${date.getFullYear()}-01-01`;
    }

    const days = {
        '1M': 30,
        '3M': 90,
        '6M': 180,
        '1Y': 365,
        '3Y': 365 * 3
    }[periodKey];

    if (!days) return '';
    date.setTime(date.getTime() - days * DAY_MS);
    return formatDate(date);
}

function normalizeSnapshot(snapshot) {
    const totalValue = Number(snapshot.totalValue);
    const netFlow = Number(snapshot.netFlow);
    if (!snapshot.date || !Number.isFinite(totalValue) || !Number.isFinite(netFlow) || totalValue < 0) return null;
    return { ...snapshot, totalValue, netFlow };
}

function buildPoint(item, unitNav, shares, netContribution, returnPct) {
    return {
        date: item.date,
        totalValue: item.totalValue,
        netFlow: item.netFlow,
        note: item.note || '',
        unitNav,
        shares,
        netContribution,
        returnPct
    };
}

function getPeriodPoints(points, startDate) {
    if (!startDate) return points;

    let anchor = null;
    const inside = [];
    points.forEach(point => {
        if (point.date >= startDate) {
            inside.push(point);
        } else {
            anchor = point;
        }
    });

    if (anchor) return [anchor, ...inside];
    return inside;
}

function calculateMaxDrawdown(points) {
    let peak = points[0].unitNav;
    let maxDrawdown = 0;
    points.forEach(point => {
        if (point.unitNav > peak) peak = point.unitNav;
        const drawdown = (point.unitNav / peak - 1) * 100;
        if (drawdown < maxDrawdown) maxDrawdown = drawdown;
    });
    return maxDrawdown;
}

function calculateAnnualizedReturn(anchorPoint, latestPoint) {
    const anchorTime = parseDate(anchorPoint.date)?.getTime();
    const latestTime = parseDate(latestPoint.date)?.getTime();
    const days = (latestTime - anchorTime) / DAY_MS;
    if (!Number.isFinite(days) || days < MIN_ANNUALIZED_DAYS || anchorPoint.unitNav <= 0 || latestPoint.unitNav <= 0) return null;
    return (Math.pow(latestPoint.unitNav / anchorPoint.unitNav, 365 / days) - 1) * 100;
}

function calculateAnnualizedVolatility(points) {
    const returns = [];
    const intervals = [];
    for (let index = 1; index < points.length; index += 1) {
        const previous = points[index - 1];
        const current = points[index];
        const previousTime = parseDate(previous.date)?.getTime();
        const currentTime = parseDate(current.date)?.getTime();
        if (!previousTime || !currentTime || currentTime <= previousTime || previous.unitNav <= 0) continue;
        returns.push(current.unitNav / previous.unitNav - 1);
        intervals.push((currentTime - previousTime) / DAY_MS);
    }

    if (returns.length < 2) return null;
    const stdev = standardDeviation(returns);
    const averageInterval = intervals.reduce((sum, value) => sum + value, 0) / intervals.length;
    return stdev * Math.sqrt(365 / Math.max(averageInterval, 1)) * 100;
}

function standardDeviation(values) {
    const average = values.reduce((sum, value) => sum + value, 0) / values.length;
    const variance = values.reduce((sum, value) => sum + (value - average) ** 2, 0) / (values.length - 1);
    return Math.sqrt(variance);
}

function parseDate(date) {
    const parsed = new Date(`${date}T00:00:00`);
    return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}
