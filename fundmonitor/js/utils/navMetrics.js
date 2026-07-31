const RETURN_PERIODS = [
    ['w1', 7],
    ['m1', 30],
    ['m3', 90],
    ['m6', 180],
    ['y1', 365],
    ['y3', 365 * 3]
];
const CHART_PERIODS = [
    ['m1', 30],
    ['m3', 90],
    ['m6', 180],
    ['y1', 365],
    ['y3', 365 * 3]
];
const DAY_MS = 24 * 60 * 60 * 1000;

export function buildNavMetrics(funds) {
    return funds
        .map(fund => {
            const points = normalizePoints(fund.items || []);
            if (points.length < 2) return null;

            const firstValue = points[0].value;
            const lastPoint = points[points.length - 1];
            const series = points.map(point => [point.date, (point.value / firstValue - 1) * 100]);

            return {
                code: fund.code,
                name: fund.name || fund.code,
                manager: fund.manager || '',
                scale: fund.scale || null,
                latestDate: lastPoint.date,
                oneYearReturn: (lastPoint.value / firstValue - 1) * 100,
                periods: calculatePeriodMetrics(points, lastPoint),
                maxDrawdown: calculateMaxDrawdown(points),
                series,
                chartSeries: calculateChartSeries(points, lastPoint)
            };
        })
        .filter(Boolean);
}

function normalizePoints(items) {
    return items
        .map(item => {
            const accNav = toNumber(item.accNav);
            const unitNav = toNumber(item.unitNav);
            const value = accNav !== null ? accNav : unitNav;
            if (!item.date || value === null || value <= 0) return null;
            return { date: item.date, value };
        })
        .filter(Boolean)
        .sort((a, b) => a.date.localeCompare(b.date));
}

function calculateMaxDrawdown(points) {
    let peak = points[0].value;
    let maxDrawdown = 0;

    points.forEach(point => {
        if (point.value > peak) peak = point.value;
        const drawdown = (point.value / peak - 1) * 100;
        if (drawdown < maxDrawdown) maxDrawdown = drawdown;
    });

    return maxDrawdown;
}

function calculatePeriodMetrics(points, lastPoint) {
    const latestTime = parseDate(lastPoint.date);
    if (latestTime === null) return {};

    return Object.fromEntries(RETURN_PERIODS.map(([key, days]) => {
        const periodPoints = getPeriodPoints(points, latestTime - days * DAY_MS);
        const startPoint = periodPoints[0];
        const returnValue = startPoint ? (lastPoint.value / startPoint.value - 1) * 100 : null;
        const maxDrawdown = periodPoints.length > 1 ? calculateMaxDrawdown(periodPoints) : null;
        const dailyReturns = calculateDailyReturns(periodPoints);
        const annualizedVolatility = dailyReturns.length > 1 ? standardDeviation(dailyReturns) * Math.sqrt(252) * 100 : null;
        const upDayRatio = dailyReturns.length > 0 ? dailyReturns.filter(value => value > 0).length / dailyReturns.length * 100 : null;
        const calmarRatio = returnValue !== null && maxDrawdown !== null && maxDrawdown < 0
            ? returnValue / Math.abs(maxDrawdown)
            : null;

        return [key, {
            returnValue,
            maxDrawdown,
            annualizedVolatility,
            calmarRatio,
            upDayRatio
        }];
    }));
}

function calculateDailyReturns(points) {
    const returns = [];
    for (let i = 1; i < points.length; i += 1) {
        const previous = points[i - 1].value;
        const current = points[i].value;
        if (previous > 0 && current > 0) returns.push(current / previous - 1);
    }
    return returns;
}

function standardDeviation(values) {
    const average = values.reduce((sum, value) => sum + value, 0) / values.length;
    const variance = values.reduce((sum, value) => sum + (value - average) ** 2, 0) / (values.length - 1);
    return Math.sqrt(variance);
}

function calculateChartSeries(points, lastPoint) {
    const latestTime = parseDate(lastPoint.date);
    if (latestTime === null) return {};

    return Object.fromEntries(CHART_PERIODS.map(([key, days]) => {
        const periodPoints = getPeriodPoints(points, latestTime - days * DAY_MS);
        const firstPoint = periodPoints[0];
        const series = firstPoint ? periodPoints.map(point => [point.date, (point.value / firstPoint.value - 1) * 100]) : [];
        return [key, series];
    }));
}

function getPeriodPoints(points, targetTime) {
    let fallback = null;
    const periodPoints = [];

    for (const point of points) {
        const pointTime = parseDate(point.date);
        if (pointTime === null) continue;

        if (pointTime >= targetTime) {
            periodPoints.push(point);
        } else {
            fallback = point;
        }
    }

    if (periodPoints.length > 0) return periodPoints;
    return fallback ? [fallback] : [];
}

function parseDate(date) {
    const time = new Date(`${date}T00:00:00`).getTime();
    return Number.isFinite(time) ? time : null;
}

function toNumber(value) {
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
}
