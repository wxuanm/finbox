import { FundNav, NavAnnualReturn, NavMetric, NavMetricPeriod } from '../types';

const RETURN_PERIODS: Array<[string, number | 'ytd']> = [
  ['ytd', 'ytd'],
  ['w1', 7],
  ['m1', 30],
  ['m3', 90],
  ['m6', 180],
  ['y1', 365],
  ['y3', 365 * 3],
  ['y5', 365 * 5]
];
const CHART_PERIODS: Array<[string, number | 'ytd']> = [
  ['ytd', 'ytd'],
  ['m1', 30],
  ['m3', 90],
  ['m6', 180],
  ['y1', 365],
  ['y3', 365 * 3],
  ['y5', 365 * 5]
];
const ANNUAL_RETURN_FULL_YEARS = 5;
// Daily returns are published with two decimals, so a 0.005 point gap is rounding rather than a data mismatch.
const DAILY_RETURN_TOLERANCE = 0.0051;
const DAY_MS = 24 * 60 * 60 * 1000;

interface NormalizedPoint {
  date: string;
  value: number;
  unitNav: number | null;
  accNav: number | null;
  dailyReturn: number | null;
}

interface DrawdownResult {
  value: number;
  startDate: string | null;
  endDate: string | null;
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
        maxDrawdown: calculateMaxDrawdown(points).value,
        series,
        chartSeries: calculateChartSeries(points, lastPoint),
        annualReturns: calculateAnnualReturns(points, lastPoint)
      };
    })
    .filter((item): item is NavMetric => item !== null);
}

// `value` is a dividend-reinvested NAV index: accumulated NAV adds dividends back as cash and understates returns of paying funds.
function normalizePoints(items: FundNav['items']): NormalizedPoint[] {
  const rawPoints = items
    .map(item => {
      const accNav = toNumber(item.accNav);
      const unitNav = toNumber(item.unitNav);
      const rawValue = accNav !== null ? accNav : unitNav;
      if (!item.date || rawValue === null || rawValue <= 0) return null;
      return { date: item.date, rawValue, unitNav, accNav, dailyReturn: toNumber(item.dailyReturn) };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .sort((a, b) => a.date.localeCompare(b.date));

  let value = rawPoints[0]?.rawValue ?? 0;
  return rawPoints.map((point, index) => {
    if (index > 0) {
      const previous = rawPoints[index - 1];
      value *= getDailyGrowth(previous, point);
    }
    return { date: point.date, value, unitNav: point.unitNav, accNav: point.accNav, dailyReturn: point.dailyReturn };
  });
}

function getDailyGrowth(
  previous: { rawValue: number; unitNav: number | null; accNav: number | null },
  current: { rawValue: number; unitNav: number | null; accNav: number | null; dailyReturn: number | null }
): number {
  const dailyReturn = current.dailyReturn !== null && current.dailyReturn > -100 ? current.dailyReturn : null;
  // Four-decimal NAV ratios beat the two-decimal daily return, but each is used only when it agrees with that return:
  // the accumulated NAV step counts a dividend as reinvested on its ex-date, yet breaks when the accumulated series was
  // rescaled for a share conversion; the unit NAV ratio survives that rescaling but drops on dividend dates.
  const candidates = [
    current.accNav !== null && previous.accNav !== null && previous.unitNav !== null && previous.unitNav > 0
      ? 1 + (current.accNav - previous.accNav) / previous.unitNav
      : null,
    current.unitNav !== null && previous.unitNav !== null && previous.unitNav > 0 ? current.unitNav / previous.unitNav : null
  ];
  if (dailyReturn === null) return candidates.find(growth => growth !== null && growth > 0) ?? current.rawValue / previous.rawValue;
  const precise = candidates.find(growth => growth !== null && growth > 0
    && Math.abs((growth - 1) * 100 - dailyReturn) <= DAILY_RETURN_TOLERANCE);
  return precise ?? 1 + dailyReturn / 100;
}

function calculateMaxDrawdown(points: NormalizedPoint[]): DrawdownResult {
  let peak = points[0];
  let maxDrawdown = 0;
  let startDate: string | null = null;
  let endDate: string | null = null;
  points.forEach(point => {
    if (point.value > peak.value) peak = point;
    const drawdown = (point.value / peak.value - 1) * 100;
    if (drawdown < maxDrawdown) {
      maxDrawdown = drawdown;
      startDate = peak.date;
      endDate = point.date;
    }
  });
  return { value: maxDrawdown, startDate, endDate };
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
    const drawdown = periodPoints.length > 1 ? calculateMaxDrawdown(periodPoints) : null;
    const maxDrawdown = drawdown?.value ?? null;
    const dailyReturns = calculateDailyReturns(periodPoints);
    const annualizedVolatility = dailyReturns.length > 1 ? standardDeviation(dailyReturns) * Math.sqrt(252) * 100 : null;
    const upDayRatio = dailyReturns.length > 0 ? dailyReturns.filter(value => value > 0).length / dailyReturns.length * 100 : null;
    const calmarRatio = returnValue !== null && maxDrawdown !== null && maxDrawdown < 0
      ? returnValue / Math.abs(maxDrawdown)
      : null;

    return [key, {
      returnValue,
      maxDrawdown,
      maxDrawdownStartDate: drawdown?.startDate ?? null,
      maxDrawdownEndDate: drawdown?.endDate ?? null,
      annualizedVolatility,
      calmarRatio,
      upDayRatio
    }];
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

function calculateChartSeries(points: NormalizedPoint[], lastPoint: NormalizedPoint): Record<string, Array<[string, number, number | null, number | null, number | null]>> {
  const latestTime = parseDate(lastPoint.date);
  if (latestTime === null) return {};

  return Object.fromEntries(CHART_PERIODS.map(([key, days]) => {
    const periodPoints = days === 'ytd'
      ? getYtdPoints(points, lastPoint.date)
      : getPeriodPoints(points, latestTime - days * DAY_MS);
    return [key, toChartSeries(periodPoints)];
  }).concat([['all', toChartSeries(points)]]));
}

function toChartSeries(periodPoints: NormalizedPoint[]): Array<[string, number, number | null, number | null, number | null]> {
  const firstPoint = periodPoints[0];
  return firstPoint
    ? periodPoints.map(point => [point.date, (point.value / firstPoint.value - 1) * 100, point.unitNav ?? point.value, point.accNav, point.dailyReturn] as [string, number, number | null, number | null, number | null])
    : [];
}

// Each calendar year's return and drawdown are measured from the previous year's last NAV; a year without one starts from its own first NAV.
function calculateAnnualReturns(points: NormalizedPoint[], lastPoint: NormalizedPoint): NavAnnualReturn[] {
  const latestYear = Number(lastPoint.date.slice(0, 4));
  if (!Number.isInteger(latestYear)) return [];

  const annualReturns: NavAnnualReturn[] = [];
  for (let year = latestYear; year >= latestYear - ANNUAL_RETURN_FULL_YEARS; year -= 1) {
    const yearStart = `${year}-01-01`;
    const nextYearStart = `${year + 1}-01-01`;
    const yearPoints = points.filter(point => point.date >= yearStart && point.date < nextYearStart);
    if (yearPoints.length === 0) continue;
    const previousPoint = findLastPointBefore(points, yearStart);
    const startPoint = previousPoint ?? yearPoints[0];
    const endPoint = yearPoints[yearPoints.length - 1];
    const drawdown = startPoint === endPoint ? null : calculateMaxDrawdown(previousPoint ? [previousPoint, ...yearPoints] : yearPoints);
    annualReturns.push({
      year,
      returnValue: startPoint === endPoint ? null : (endPoint.value / startPoint.value - 1) * 100,
      maxDrawdown: drawdown?.value ?? null,
      maxDrawdownStartDate: drawdown?.startDate ?? null,
      maxDrawdownEndDate: drawdown?.endDate ?? null,
      startDate: startPoint.date,
      endDate: endPoint.date,
      isYearToDate: year === latestYear,
      startsMidYear: !previousPoint
    });
  }
  return annualReturns;
}

function findLastPointBefore(points: NormalizedPoint[], date: string): NormalizedPoint | null {
  let found: NormalizedPoint | null = null;
  for (const point of points) {
    if (point.date >= date) break;
    found = point;
  }
  return found;
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
  const yearStart = `${latestDate.slice(0, 4)}-01-01`;
  const periodPoints = getPeriodPoints(points, parseDate(yearStart) ?? latestTime);
  // Start from the previous year's last NAV so the first trading day's move counts toward this year.
  const basePoint = findLastPointBefore(points, yearStart);
  return basePoint && periodPoints[0]?.date >= yearStart ? [basePoint, ...periodPoints] : periodPoints;
}

function parseDate(date: string): number | null {
  const time = new Date(`${date}T00:00:00`).getTime();
  return Number.isFinite(time) ? time : null;
}

function toNumber(value: unknown): number | null {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}
