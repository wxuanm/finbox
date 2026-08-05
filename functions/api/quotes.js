const MAX_ITEMS = 40;

export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  const items = parseItems(url.searchParams.get('items'));

  if (items.length === 0) {
    return jsonResponse({ error: 'Missing quote items' }, 400);
  }

  if (items.length > MAX_ITEMS) {
    return jsonResponse({ error: `Quote refresh supports up to ${MAX_ITEMS} items` }, 400);
  }

  const cnItems = items.filter(item => item.market === 'CN');
  const fundItems = items.filter(item => item.market === 'Fund');
  const unsupported = items.filter(item => !['CN', 'Fund'].includes(item.market));
  const quotes = [];
  const failedItems = unsupported.map(formatItemKey);

  const results = await Promise.allSettled([
    fetchAshareQuotes(cnItems),
    fetchFundQuotes(fundItems)
  ]);

  results.forEach((result, index) => {
    const sourceItems = index === 0 ? cnItems : fundItems;
    if (result.status === 'fulfilled') {
      quotes.push(...result.value.quotes);
      failedItems.push(...result.value.failedItems);
    } else {
      failedItems.push(...sourceItems.map(formatItemKey));
    }
  });

  return jsonResponse({
    source: 'eastmoney',
    updatedAt: new Date().toISOString(),
    quotes,
    failedItems
  }, 200, {
    'Cache-Control': 'no-store'
  });
}

function parseItems(value) {
  return [...new Set(String(value || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean))]
    .map(item => {
      const [market, symbol] = item.split(':').map(part => String(part || '').trim());
      if (!market || !symbol) return null;
      return { market, symbol };
    })
    .filter(Boolean);
}

async function fetchAshareQuotes(items) {
  if (items.length === 0) return { quotes: [], failedItems: [] };

  const secids = items.map(item => `${getAshareExchangePrefix(item.symbol)}.${item.symbol}`).join(',');
  const targetUrl = `https://push2.eastmoney.com/api/qt/ulist.np/get?fltt=2&fields=f12,f14,f2,f3,f124&secids=${encodeURIComponent(secids)}`;
  const response = await fetch(targetUrl, {
    headers: {
      'Referer': 'https://quote.eastmoney.com/',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
  });

  if (!response.ok) throw new Error(`Eastmoney stock quote failed: ${response.status}`);
  const data = await response.json();
  const rows = Array.isArray(data?.data?.diff) ? data.data.diff : [];
  const quoteMap = new Map(rows.map(row => [String(row.f12), row]));

  return {
    quotes: items.map(item => {
      const row = quoteMap.get(item.symbol);
      const price = toNumber(row?.f2);
      if (!row || price === null) return null;
      return {
        market: item.market,
        symbol: item.symbol,
        name: row.f14 || item.symbol,
        price,
        changePct: toNumber(row.f3),
        currency: 'CNY',
        quoteTime: formatEastmoneyTimestamp(row.f124)
      };
    }).filter(Boolean),
    failedItems: items.filter(item => !quoteMap.has(item.symbol)).map(formatItemKey)
  };
}

async function fetchFundQuotes(items) {
  if (items.length === 0) return { quotes: [], failedItems: [] };

  const targetUrl = `https://fund.eastmoney.com/Data/FundCompare_Interface.aspx?t=0&bzdm=${encodeURIComponent(items.map(item => item.symbol).join(','))}&rt=${Date.now()}`;
  const response = await fetch(targetUrl, {
    headers: {
      'Referer': 'https://fund.eastmoney.com/',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
  });

  if (!response.ok) throw new Error(`Eastmoney fund quote failed: ${response.status}`);
  const script = await response.text();
  const match = script.match(/var\s+fundinfo\s*=\s*(\[[\s\S]*?\]);?/);
  const rows = match ? JSON.parse(match[1]) : [];
  const quoteMap = new Map(rows.map(row => {
    const fields = String(row).split(',');
    return [fields[0], fields];
  }));

  return {
    quotes: items.map(item => {
      const fields = quoteMap.get(item.symbol);
      const estimatedNav = toNumber(fields?.[4]);
      const unitNav = toNumber(fields?.[6]);
      const price = estimatedNav ?? unitNav;
      if (!fields || price === null) return null;
      return {
        market: item.market,
        symbol: item.symbol,
        name: fields[1] || item.symbol,
        price,
        changePct: toNumber(fields[5] ?? fields[9]),
        currency: 'CNY',
        quoteTime: fields[7] || new Date().toISOString()
      };
    }).filter(Boolean),
    failedItems: items.filter(item => !quoteMap.has(item.symbol)).map(formatItemKey)
  };
}

function getAshareExchangePrefix(symbol) {
  return /^6/.test(symbol) ? '1' : '0';
}

function formatItemKey(item) {
  return `${item.market}:${item.symbol}`;
}

function formatEastmoneyTimestamp(value) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return new Date().toISOString();
  return new Date(seconds * 1000).toISOString();
}

function toNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? num : null;
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
