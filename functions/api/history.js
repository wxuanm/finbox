import { extractJsonVar, extractStringVar, formatShanghaiDate } from './_lib/eastmoneyScript.js';
import { getAshareExchangePrefix } from './_lib/quoteSources.js';

// Daily price history for portfolio backtesting.
// GET /api/history?items=CN:600519,Fund:110011,Index:000300&start=2018-01-01
//   CN    -> A-share daily close, back-adjusted (后复权, dividends reinvested)
//   Fund  -> total-return index chained from Eastmoney daily growth (equityReturn)
//   Index -> allowlisted index daily close (price index, not adjusted)

const MAX_ITEMS = 25;
const DEFAULT_YEARS = 10;
const FETCH_TIMEOUT_MS = 10000;
const KLINE_UT = 'fa5fd1943c7b386f172d6893dbfba10b';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

export const INDEX_SECIDS = {
  '000300': '1.000300', // 沪深300
  '000905': '1.000905', // 中证500
  '000852': '1.000852', // 中证1000
  '000001': '1.000001', // 上证指数
  '399006': '0.399006', // 创业板指
  '000016': '1.000016'  // 上证50
};

const SUPPORTED_MARKETS = ['CN', 'Fund', 'Index'];

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const parsed = parseItems(url.searchParams.get('items'));

  if (parsed.invalid.length > 0) {
    return jsonResponse({ error: `Invalid items: ${parsed.invalid.join(',')}` }, 400);
  }
  if (parsed.items.length === 0) {
    return jsonResponse({ error: 'Missing items' }, 400);
  }
  if (parsed.items.length > MAX_ITEMS) {
    return jsonResponse({ error: `History supports up to ${MAX_ITEMS} items` }, 400);
  }

  const startParam = url.searchParams.get('start');
  if (startParam && !isValidDateKey(startParam)) {
    return jsonResponse({ error: 'Invalid start date, expected YYYY-MM-DD' }, 400);
  }
  const start = startParam || defaultStartDate();

  const results = await Promise.allSettled(parsed.items.map(item => fetchSeries(item, start)));
  const series = [];
  const failedItems = [];

  results.forEach((result, index) => {
    const item = parsed.items[index];
    if (result.status === 'fulfilled' && result.value && result.value.points.length > 0) {
      series.push(result.value);
    } else {
      failedItems.push({
        market: item.market,
        symbol: item.symbol,
        error: result.status === 'rejected' ? String(result.reason?.message || result.reason) : 'No data'
      });
    }
  });

  return jsonResponse({
    source: 'eastmoney',
    start,
    updatedAt: new Date().toISOString(),
    series,
    failedItems
  }, series.length > 0 ? 200 : 502, {
    'Cache-Control': series.length > 0 && failedItems.length === 0
      ? 'public, max-age=3600'
      : 'no-store, max-age=0'
  });
}

function parseItems(param) {
  const items = [];
  const invalid = [];
  const seen = new Set();

  String(param || '')
    .split(',')
    .map(raw => raw.trim())
    .filter(Boolean)
    .forEach(raw => {
      const [market, symbol] = raw.split(':').map(part => (part || '').trim());
      const valid = SUPPORTED_MARKETS.includes(market)
        && /^\d{6}$/.test(symbol)
        && (market !== 'Index' || Object.prototype.hasOwnProperty.call(INDEX_SECIDS, symbol));
      if (!valid) {
        invalid.push(raw);
        return;
      }
      const key = `${market}:${symbol}`;
      if (seen.has(key)) return;
      seen.add(key);
      items.push({ market, symbol });
    });

  return { items, invalid };
}

function fetchSeries(item, start) {
  if (item.market === 'Fund') return fetchFundSeries(item.symbol, start);
  const secid = item.market === 'Index'
    ? INDEX_SECIDS[item.symbol]
    : `${getAshareExchangePrefix(item.symbol)}.${item.symbol}`;
  return fetchKlineSeries(item, secid, start);
}

async function fetchKlineSeries(item, secid, start) {
  const fqt = item.market === 'CN' ? '2' : '0';
  const params = new URLSearchParams({
    secid,
    ut: KLINE_UT,
    fields1: 'f1,f2,f3',
    fields2: 'f51,f53',
    klt: '101',
    fqt,
    beg: start.replace(/-/g, ''),
    end: '20500101'
  });
  const response = await fetchWithTimeout(`https://push2his.eastmoney.com/api/qt/stock/kline/get?${params}`, {
    headers: { 'Referer': 'https://quote.eastmoney.com/', 'User-Agent': USER_AGENT }
  });
  if (!response.ok) throw new Error(`Eastmoney kline request failed: ${response.status}`);

  const payload = await response.json();
  const data = payload?.data;
  const klines = Array.isArray(data?.klines) ? data.klines : [];
  if (klines.length === 0) throw new Error('No kline data');

  const points = klines
    .map(line => {
      const [date, close] = String(line).split(',');
      const value = Number(close);
      return isValidDateKey(date) && Number.isFinite(value) && value > 0 ? [date, value] : null;
    })
    .filter(Boolean)
    .filter(([date]) => date >= start);

  return {
    market: item.market,
    symbol: item.symbol,
    name: data.name || item.symbol,
    adjust: item.market === 'CN' ? 'hfq' : 'none',
    points
  };
}

async function fetchFundSeries(code, start) {
  const response = await fetchWithTimeout(
    `https://fund.eastmoney.com/pingzhongdata/${encodeURIComponent(code)}.js?v=${Date.now()}`,
    { headers: { 'Referer': 'https://fund.eastmoney.com/', 'User-Agent': USER_AGENT } }
  );
  if (!response.ok) throw new Error(`Eastmoney fund request failed: ${response.status}`);

  const script = await response.text();
  const name = extractStringVar(script, 'fS_name') || code;
  const trend = extractJsonVar(script, 'Data_netWorthTrend');
  if (!Array.isArray(trend) || trend.length === 0) throw new Error('Missing net worth trend');

  const points = chainFundTrend(trend).filter(([date]) => date >= start);
  return { market: 'Fund', symbol: code, name, adjust: 'nav-chained', points };
}

// Builds a dividend-reinvested NAV index: starts at the first unit NAV and compounds
// Eastmoney's daily growth rate (equityReturn, %), which already accounts for
// distributions. Falls back to the unit NAV ratio when the growth rate is missing.
export function chainFundTrend(trend) {
  const rows = trend
    .map(point => {
      const timestamp = Number(point?.x);
      const unitNav = Number(point?.y);
      const date = formatShanghaiDate(timestamp);
      if (!date || !Number.isFinite(unitNav) || unitNav <= 0) return null;
      const growth = point?.equityReturn;
      const dailyReturn = growth === null || growth === undefined || growth === '' ? null : Number(growth);
      return { timestamp, date, unitNav, dailyReturn: Number.isFinite(dailyReturn) ? dailyReturn : null };
    })
    .filter(Boolean)
    .sort((a, b) => a.timestamp - b.timestamp);

  const points = [];
  let value = null;
  let previous = null;

  rows.forEach(row => {
    if (value === null) {
      value = row.unitNav;
    } else if (row.dailyReturn !== null) {
      value *= 1 + row.dailyReturn / 100;
    } else {
      value *= row.unitNav / previous.unitNav;
    }
    previous = row;

    const rounded = Number(value.toFixed(6));
    const last = points[points.length - 1];
    if (last && last[0] === row.date) {
      last[1] = rounded;
    } else {
      points.push([row.date, rounded]);
    }
  });

  return points;
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('Upstream request timed out');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function isValidDateKey(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function defaultStartDate() {
  const now = new Date();
  now.setUTCFullYear(now.getUTCFullYear() - DEFAULT_YEARS);
  return now.toISOString().slice(0, 10);
}

function jsonResponse(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json;charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      ...headers
    }
  });
}
