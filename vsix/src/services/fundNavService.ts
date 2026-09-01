import { FundNav, FundNavResponse } from '../types';
import { normalizeFundCodes } from '../utils/marketSymbols';

const MAX_CODES = 10;
const THREE_YEARS_MS = 365 * 3 * 24 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 15000;

export class FundNavService {
  private readonly cache = new Map<string, { dateKey: string; data: FundNavResponse }>();

  async fetchThreeYearFundNav(inputCodes: string[]): Promise<FundNavResponse> {
    const codes = normalizeFundCodes(inputCodes).slice(0, MAX_CODES);
    const cacheKey = codes.slice().sort((a, b) => a.localeCompare(b, 'en', { numeric: true })).join(',');
    const todayKey = getLocalDateKey(new Date());
    const cached = this.cache.get(cacheKey);
    if (cached?.dateKey === todayKey) return cached.data;

    const results = await Promise.allSettled(codes.map(code => this.fetchFundNav(code)));
    const funds: FundNav[] = [];
    const failedCodes: string[] = [];

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        funds.push(result.value);
      } else {
        failedCodes.push(codes[index]);
      }
    });

    const data: FundNavResponse = {
      range: '3y',
      source: 'eastmoney',
      updatedAt: new Date().toISOString(),
      funds,
      failedCodes
    };
    if (funds.length > 0) this.cache.set(cacheKey, { dateKey: todayKey, data });
    return data;
  }

  private async fetchFundNav(code: string): Promise<FundNav> {
    const targetUrl = `https://fund.eastmoney.com/pingzhongdata/${encodeURIComponent(code)}.js?v=${Date.now()}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(targetUrl, {
        signal: controller.signal,
        headers: {
          Referer: 'https://fund.eastmoney.com/',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });

      if (!response.ok) throw new Error(`Eastmoney nav request failed: ${response.status}`);

      const script = await response.text();
      const name = extractStringVar(script, 'fS_name') || code;
      const manager = extractFundManager(script);
      const scale = extractFundScale(script);
      const unitTrend = extractJsonVar(script, 'Data_netWorthTrend');
      const accTrend = extractJsonVar(script, 'Data_ACWorthTrend');

      if (!Array.isArray(unitTrend) || unitTrend.length === 0) throw new Error('Missing net worth trend');

      const unitItems = unitTrend.map(normalizeUnitPoint).filter(isTrendItem);
      const accItems = Array.isArray(accTrend) ? accTrend.map(normalizeAccPoint).filter(isTrendItem) : [];
      const allItems = [...unitItems, ...accItems];
      const latestTimestamp = allItems.reduce((latest, item) => Math.max(latest, item.timestamp), 0);
      const cutoff = latestTimestamp ? latestTimestamp - THREE_YEARS_MS : Date.now() - THREE_YEARS_MS;
      const itemByDate = new Map<string, TrendItem>();

      allItems.forEach(item => {
        if (item.timestamp < cutoff) return;
        const current = itemByDate.get(item.date) || { timestamp: item.timestamp, date: item.date, unitNav: null, accNav: null, dailyReturn: null };
        current.timestamp = Math.max(current.timestamp, item.timestamp);
        if (item.unitNav !== null) current.unitNav = item.unitNav;
        if (item.accNav !== null) current.accNav = item.accNav;
        if (item.dailyReturn !== null) current.dailyReturn = item.dailyReturn;
        itemByDate.set(item.date, current);
      });

      const items = [...itemByDate.values()]
        .sort((a, b) => a.timestamp - b.timestamp)
        .map(({ timestamp, ...item }) => item);

      if (items.length === 0) throw new Error('No three-year nav data');
      return { code, name, manager, scale, items };
    } finally {
      clearTimeout(timeout);
    }
  }
}

interface TrendItem {
  timestamp: number;
  date: string;
  unitNav: number | null;
  accNav: number | null;
  dailyReturn: number | null;
}

function isTrendItem(item: TrendItem | null): item is TrendItem {
  return item !== null;
}

function extractFundManager(script: string): string {
  const managers = extractJsonVar(script, 'Data_currentFundManager');
  if (!Array.isArray(managers)) return '';
  return managers.map(manager => manager?.name).filter(Boolean).join(' / ');
}

function extractFundScale(script: string): FundNav['scale'] {
  const assetScale = extractAssetAllocationScale(script);
  if (assetScale) return assetScale;

  const scale = extractJsonVar(script, 'Data_fluctuationScale');
  const categories = Array.isArray(scale?.categories) ? scale.categories : [];
  const series = Array.isArray(scale?.series) ? scale.series : [];
  for (let index = series.length - 1; index >= 0; index -= 1) {
    const value = toNumber(series[index]?.y);
    if (value !== null) return { date: categories[index] || '', value };
  }
  return null;
}

function extractAssetAllocationScale(script: string): FundNav['scale'] {
  const assetAllocation = extractJsonVar(script, 'Data_assetAllocation');
  const categories = Array.isArray(assetAllocation?.categories) ? assetAllocation.categories : [];
  const netAssetSeries = Array.isArray(assetAllocation?.series)
    ? assetAllocation.series.find((item: { name?: string }) => item?.name === '净资产')
    : null;
  const data = Array.isArray(netAssetSeries?.data) ? netAssetSeries.data : [];
  for (let index = data.length - 1; index >= 0; index -= 1) {
    const value = toNumber(data[index]);
    if (value !== null) return { date: categories[index] || '', value };
  }
  return null;
}

function normalizeUnitPoint(point: unknown): TrendItem | null {
  if (!point || typeof point !== 'object') return null;
  const value = point as { x?: unknown; y?: unknown; equityReturn?: unknown };
  const timestamp = toNumber(value.x);
  const date = formatDate(timestamp);
  const unitNav = toNumber(value.y);
  if (!date || timestamp === null || unitNav === null) return null;
  return { timestamp, date, unitNav, accNav: null, dailyReturn: toNumber(value.equityReturn) };
}

function normalizeAccPoint(point: unknown): TrendItem | null {
  if (!Array.isArray(point) || point.length < 2) return null;
  const timestamp = toNumber(point[0]);
  const date = formatDate(timestamp);
  const accNav = toNumber(point[1]);
  if (!date || timestamp === null || accNav === null) return null;
  return { timestamp, date, unitNav: null, accNav, dailyReturn: null };
}

function extractStringVar(script: string, name: string): string {
  const match = script.match(new RegExp(`var\\s+${name}\\s*=\\s*"([^"]*)"`));
  return match ? match[1] : '';
}

function extractJsonVar(script: string, name: string): any {
  const match = script.match(new RegExp(`var\\s+${name}\\s*=\\s*`));
  if (!match || match.index === undefined) return null;
  const valueStart = match.index + match[0].length;
  const firstChar = script[valueStart];
  const closingChar = firstChar === '[' ? ']' : firstChar === '{' ? '}' : '';
  if (!closingChar) return null;

  let depth = 0;
  let inString = false;
  let escapeNext = false;
  for (let index = valueStart; index < script.length; index += 1) {
    const char = script[index];
    if (escapeNext) {
      escapeNext = false;
      continue;
    }
    if (char === '\\' && inString) {
      escapeNext = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (char === firstChar) depth += 1;
    if (char === closingChar) depth -= 1;
    if (depth === 0) {
      try {
        return JSON.parse(script.slice(valueStart, index + 1));
      } catch {
        return null;
      }
    }
  }
  return null;
}

function formatDate(timestamp: number | null): string {
  if (timestamp === null) return '';
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' });
}

function getLocalDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function toNumber(value: unknown): number | null {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
}
