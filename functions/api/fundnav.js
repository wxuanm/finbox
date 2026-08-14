const MAX_CODES = 10;
const THREE_YEARS_MS = 365 * 3 * 24 * 60 * 60 * 1000;

export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  const codes = parseCodes(url.searchParams.get('code'));

  if (codes.length === 0) {
    return jsonResponse({ error: 'Missing fund code' }, 400);
  }

  if (codes.length > MAX_CODES) {
    return jsonResponse({ error: `Fund nav comparison supports up to ${MAX_CODES} codes` }, 400);
  }

  const results = await Promise.allSettled(codes.map(fetchThreeYearFundNav));
  const funds = [];
  const failedCodes = [];

  results.forEach((result, index) => {
    if (result.status === 'fulfilled' && result.value) {
      funds.push(result.value);
    } else {
      failedCodes.push(codes[index]);
    }
  });

  return jsonResponse({
    range: '3y',
    source: 'eastmoney',
    updatedAt: new Date().toISOString(),
    funds,
    failedCodes
  }, funds.length > 0 ? 200 : 502, {
    'Cache-Control': 'no-store, max-age=0'
  });
}

function parseCodes(codeParam) {
  return [...new Set(String(codeParam || '')
    .split(',')
    .map(code => code.trim())
    .filter(code => /^\d{6}$/.test(code)))];
}

async function fetchThreeYearFundNav(code) {
  const targetUrl = `https://fund.eastmoney.com/pingzhongdata/${encodeURIComponent(code)}.js?v=${Date.now()}`;
  const response = await fetch(targetUrl, {
    headers: {
      'Referer': 'https://fund.eastmoney.com/',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
  });

  if (!response.ok) {
    throw new Error(`Eastmoney request failed: ${response.status}`);
  }

  const script = await response.text();
  const name = extractStringVar(script, 'fS_name') || code;
  const manager = extractFundManager(script);
  const scale = extractFundScale(script);
  const unitTrend = extractJsonVar(script, 'Data_netWorthTrend');
  const accTrend = extractJsonVar(script, 'Data_ACWorthTrend');

  if (!Array.isArray(unitTrend) || unitTrend.length === 0) {
    throw new Error('Missing net worth trend');
  }

  const unitItems = unitTrend
    .map(normalizeUnitPoint)
    .filter(Boolean);
  const accItems = Array.isArray(accTrend)
    ? accTrend.map(normalizeAccPoint).filter(Boolean)
    : [];
  const allItems = [...unitItems, ...accItems];
  const latestTimestamp = allItems.reduce((latest, item) => {
    return item.timestamp > latest ? item.timestamp : latest;
  }, 0);
  const cutoff = latestTimestamp ? latestTimestamp - THREE_YEARS_MS : Date.now() - THREE_YEARS_MS;

  const itemByDate = new Map();
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

  if (items.length === 0) {
    throw new Error('No three-year nav data');
  }

  return { code, name, manager, scale, items };
}

function extractFundManager(script) {
  const managers = extractJsonVar(script, 'Data_currentFundManager');
  if (!Array.isArray(managers)) return '';

  return managers
    .map(manager => manager && manager.name)
    .filter(Boolean)
    .join(' / ');
}

function extractFundScale(script) {
  const assetScale = extractAssetAllocationScale(script);
  if (assetScale) return assetScale;

  const scale = extractJsonVar(script, 'Data_fluctuationScale');
  const categories = Array.isArray(scale?.categories) ? scale.categories : [];
  const series = Array.isArray(scale?.series) ? scale.series : [];

  for (let index = series.length - 1; index >= 0; index -= 1) {
    const value = toNumber(series[index]?.y);
    if (value !== null) {
      return {
        date: categories[index] || '',
        value
      };
    }
  }

  return null;
}

function extractAssetAllocationScale(script) {
  const assetAllocation = extractJsonVar(script, 'Data_assetAllocation');
  const categories = Array.isArray(assetAllocation?.categories) ? assetAllocation.categories : [];
  const netAssetSeries = Array.isArray(assetAllocation?.series)
    ? assetAllocation.series.find(item => item?.name === '净资产')
    : null;
  const data = Array.isArray(netAssetSeries?.data) ? netAssetSeries.data : [];

  for (let index = data.length - 1; index >= 0; index -= 1) {
    const value = toNumber(data[index]);
    if (value !== null) {
      return {
        date: categories[index] || '',
        value
      };
    }
  }

  return null;
}

function normalizeUnitPoint(point) {
  if (!point || typeof point !== 'object') return null;

  const timestamp = toNumber(point.x);
  const date = formatDate(timestamp);
  const unitNav = toNumber(point.y);
  if (!date || unitNav === null) return null;

  const dailyReturn = toNumber(point.equityReturn);
  return {
    timestamp,
    date,
    unitNav,
    accNav: null,
    dailyReturn
  };
}

function normalizeAccPoint(point) {
  if (!Array.isArray(point) || point.length < 2) return null;

  const timestamp = toNumber(point[0]);
  const date = formatDate(timestamp);
  const accNav = toNumber(point[1]);
  if (!date || accNav === null) return null;

  return {
    timestamp,
    date,
    unitNav: null,
    accNav,
    dailyReturn: null
  };
}

function extractStringVar(script, name) {
  const match = script.match(new RegExp(`var\\s+${name}\\s*=\\s*"([^"]*)"`));
  return match ? match[1] : '';
}

function extractJsonVar(script, name) {
  const match = script.match(new RegExp(`var\\s+${name}\\s*=\\s*`));
  if (!match) return null;

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
      } catch (error) {
        return null;
      }
    }
  }

  return null;
}

function formatDate(timestamp) {
  const value = toNumber(timestamp);
  if (value === null) return '';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  return date.toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' });
}

function toNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
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
