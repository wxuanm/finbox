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
    'Cache-Control': 'public, max-age=1800, s-maxage=21600, stale-while-revalidate=86400'
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
  const unitTrend = extractJsonVar(script, 'Data_netWorthTrend');
  const accTrend = extractJsonVar(script, 'Data_ACWorthTrend');

  if (!Array.isArray(unitTrend) || unitTrend.length === 0) {
    throw new Error('Missing net worth trend');
  }

  const accNavByDate = new Map();
  if (Array.isArray(accTrend)) {
    accTrend.forEach(point => {
      if (!Array.isArray(point) || point.length < 2) return;
      const date = formatDate(point[0]);
      const accNav = toNumber(point[1]);
      if (date && accNav !== null) accNavByDate.set(date, accNav);
    });
  }

  const latestTimestamp = unitTrend.reduce((latest, point) => {
    const timestamp = toNumber(point && point.x);
    return timestamp !== null && timestamp > latest ? timestamp : latest;
  }, 0);
  const cutoff = latestTimestamp ? latestTimestamp - THREE_YEARS_MS : Date.now() - THREE_YEARS_MS;

  const items = unitTrend
    .map(point => normalizeUnitPoint(point, accNavByDate))
    .filter(item => item && item.timestamp >= cutoff)
    .map(({ timestamp, ...item }) => item);

  if (items.length === 0) {
    throw new Error('No three-year nav data');
  }

  return { code, name, items };
}

function normalizeUnitPoint(point, accNavByDate) {
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
    accNav: accNavByDate.get(date) ?? null,
    dailyReturn
  };
}

function extractStringVar(script, name) {
  const match = script.match(new RegExp(`var\\s+${name}\\s*=\\s*"([^"]*)"`));
  return match ? match[1] : '';
}

function extractJsonVar(script, name) {
  const startToken = `var ${name} = `;
  const start = script.indexOf(startToken);
  if (start === -1) return null;

  const valueStart = start + startToken.length;
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

  return date.toISOString().slice(0, 10);
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
