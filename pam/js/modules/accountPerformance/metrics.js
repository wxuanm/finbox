import { t } from '../../config/i18n.js';

const DAY_MS = 24 * 60 * 60 * 1000;

export function buildAccountMetrics(accounts, snapshots, periodKey) {
    return accounts.map(account => {
        const seriesResult = buildAccountSeries(account, snapshots);
        if (seriesResult.error) {
            return { account, valid: false, error: seriesResult.error, points: [] };
        }

        const points = seriesResult.points;
        const latestPoint = points[points.length - 1];
        const periodPoints = getPeriodPoints(points, periodKey);
        const anchorPoint = periodPoints[0];
        const periodReturn = anchorPoint ? (latestPoint.unitNav / anchorPoint.unitNav - 1) * 100 : null;
        const periodDrawdown = periodPoints.length > 1 ? calculateMaxDrawdown(periodPoints) : null;
        const volatility = periodPoints.length > 2 ? calculateAnnualizedVolatility(periodPoints) : null;
        const calmar = Number.isFinite(periodReturn) && Number.isFinite(periodDrawdown) && periodDrawdown < 0
            ? periodReturn / Math.abs(periodDrawdown)
            : null;

        return {
            account,
            valid: true,
            points,
            periodPoints,
            latestDate: latestPoint.date,
            latestValue: latestPoint.totalValue,
            netContribution: latestPoint.netContribution,
            profitLoss: latestPoint.totalValue - latestPoint.netContribution,
            cumulativeReturn: latestPoint.returnPct,
            periodReturn,
            maxDrawdown: periodDrawdown,
            annualizedVolatility: volatility,
            calmarRatio: calmar
        };
    });
}

export function buildAccountSeries(account, snapshots) {
    const items = snapshots
        .filter(snapshot => snapshot.accountId === account.id)
        .map(normalizeSnapshot)
        .filter(Boolean)
        .sort((a, b) => a.date.localeCompare(b.date));

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

function getPeriodPoints(points, periodKey) {
    const latest = points[points.length - 1];
    const startDate = getPeriodStartDate(latest.date, periodKey);
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
