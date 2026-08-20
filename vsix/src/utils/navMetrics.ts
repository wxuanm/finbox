import { FundNav, NavMetric, NavMetricPeriod } from '../types';

const RETURN_PERIODS: Array<[string, number | 'ytd']> = [
  ['ytd', 'ytd'],
  ['w1', 7],
  ['m1', 30],
  ['m3', 90],
  ['m6', 180],
  ['y1', 365],
  ['y3', 365 * 3]
];
const CHART_PERIODS: Array<[string, number | 'ytd']> = [
  ['ytd', 'ytd'],
  ['m1', 30],
  ['m3', 90],
  ['m6', 180],
  ['y1', 365],
  ['y3', 365 * 3]
];
const DAY_MS = 24 * 60 * 60 * 1000;

interface NormalizedPoint {
  date: string;
  value: number;
}

export function buildNavMetrics(funds: FundNav[]): NavMetric[] {
  return funds
    .map(fund => {
      const points = normalizePoints(fund.items || []);
      if (points.length < 2) return null;

      const firstValue = points[0].value;
      const lastPoint = points[points.length - 1];
      const series = points.map(point => [point.date, (point.value / firstValue - 1) * 100] as [string, number]);

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
    .filter((item): item is NavMetric => item !== null);
}

function normalizePoints(items: FundNav['items']): NormalizedPoint[] {
  return items
    .map(item => {
      const accNav = toNumber(item.accNav);
      const unitNav = toNumber(item.unitNav);
      const value = accNav !== null ? accNav : unitNav;
      if (!item.date || value === null || value <= 0) return null;
      return { date: item.date, value };
    })
    .filter((item): item is NormalizedPoint => item !== null)
    .sort((a, b) => a.date.localeCompare(b.date));
}

function calculateMaxDrawdown(points: NormalizedPoint[]): number {
  let peak = points[0].value;
  let maxDrawdown = 0;
  points.forEach(point => {
    if (point.value > peak) peak = point.value;
    const drawdown = (point.value / peak - 1) * 100;
    if (drawdown < maxDrawdown) maxDrawdown = drawdown;
  });
  return maxDrawdown;
}

function calculatePeriodMetrics(points: NormalizedPoint[], lastPoint: NormalizedPoint): Record<string, NavMetricPeriod> {
  const latestTime = parseDate(lastPoint.date);
  if (latestTime === null) return {};

  return Object.fromEntries(RETURN_PERIODS.map(([key, days]) => {
    const periodPoints = days === 'ytd'
      ? getYtdPoints(points, lastPoint.date)
      : getPeriodPoints(points, latestTime - days * DAY_MS);
    const startPoint = periodPoints[0];
    const returnValue = startPoint ? (lastPoint.value / startPoint.value - 1) * 100 : null;
    const maxDrawdown = periodPoints.length > 1 ? calculateMaxDrawdown(periodPoints) : null;
    const dailyReturns = calculateDailyReturns(periodPoints);
    const annualizedVolatility = dailyReturns.length > 1 ? standardDeviation(dailyReturns) * Math.sqrt(252) * 100 : null;
    const upDayRatio = dailyReturns.length > 0 ? dailyReturns.filter(value => value > 0).length / dailyReturns.length * 100 : null;
    const calmarRatio = returnValue !== null && maxDrawdown !== null && maxDrawdown < 0
      ? returnValue / Math.abs(maxDrawdown)
      : null;

    return [key, { returnValue, maxDrawdown, annualizedVolatility, calmarRatio, upDayRatio }];
  }));
}

function calculateDailyReturns(points: NormalizedPoint[]): number[] {
  const returns: number[] = [];
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1].value;
    const current = points[index].value;
    if (previous > 0 && current > 0) returns.push(current / previous - 1);
  }
  return returns;
}

function standardDeviation(values: number[]): number {
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - average) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function calculateChartSeries(points: NormalizedPoint[], lastPoint: NormalizedPoint): Record<string, Array<[string, number]>> {
  const latestTime = parseDate(lastPoint.date);
  if (latestTime === null) return {};

  return Object.fromEntries(CHART_PERIODS.map(([key, days]) => {
    const periodPoints = days === 'ytd'
      ? getYtdPoints(points, lastPoint.date)
      : getPeriodPoints(points, latestTime - days * DAY_MS);
    const firstPoint = periodPoints[0];
    const series = firstPoint ? periodPoints.map(point => [point.date, (point.value / firstPoint.value - 1) * 100] as [string, number]) : [];
    return [key, series];
  }));
}

function getPeriodPoints(points: NormalizedPoint[], targetTime: number): NormalizedPoint[] {
  let fallback: NormalizedPoint | null = null;
  const periodPoints: NormalizedPoint[] = [];

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

function getYtdPoints(points: NormalizedPoint[], latestDate: string): NormalizedPoint[] {
  const latestTime = parseDate(latestDate);
  if (latestTime === null) return [];
  const latest = new Date(latestTime);
  return getPeriodPoints(points, new Date(latest.getFullYear(), 0, 1).getTime());
}

function parseDate(date: string): number | null {
  const time = new Date(`${date}T00:00:00`).getTime();
  return Number.isFinite(time) ? time : null;
}

function toNumber(value: unknown): number | null {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}
