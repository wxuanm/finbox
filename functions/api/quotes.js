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
    source: 'mixed',
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

  const quotes = [];
  const failedItems = [];

  const sinaResults = await Promise.allSettled(items.map(fetchSinaAshareQuote));
  sinaResults.forEach(result => {
    if (result.status === 'fulfilled' && result.value) quotes.push(result.value);
  });

  const missingItems = items.filter(item => !quotes.some(quote => quote.symbol === item.symbol));
  if (missingItems.length > 0) {
    const fallbackResults = await Promise.allSettled(missingItems.map(fetchSingleEastmoneyAshareQuote));
    fallbackResults.forEach((result, index) => {
      const itemKey = formatItemKey(missingItems[index]);
      if (result.status === 'fulfilled' && result.value) {
        quotes.push(result.value);
        return;
      }
      if (!failedItems.includes(itemKey)) failedItems.push(itemKey);
    });
  }

  return { quotes, failedItems };
}

async function fetchSingleEastmoneyAshareQuote(item) {
  const secid = `${getAshareExchangePrefix(item.symbol)}.${item.symbol}`;
  const targetUrl = `https://push2.eastmoney.com/api/qt/stock/get?fltt=2&fields=f57,f58,f43,f60,f86,f170&secid=${encodeURIComponent(secid)}`;
  const response = await fetch(targetUrl, {
    headers: {
      'Referer': 'https://quote.eastmoney.com/',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
  });

  if (!response.ok) throw new Error(`Eastmoney single stock quote failed: ${response.status}`);
  const data = await response.json();
  const row = data?.data;
  const latestPrice = toNumber(row?.f43);
  const previousClose = toNumber(row?.f60);
  const price = latestPrice ?? previousClose;
  if (!row || price === null) return null;
  return {
    market: item.market,
    symbol: item.symbol,
    name: row.f58 || item.symbol,
    price,
    latestPrice,
    previousClose,
    changePct: toNumber(row.f170),
    currency: 'CNY',
    quoteTime: formatEastmoneyTimestamp(row.f86),
    source: 'eastmoney'
  };
}

async function fetchSinaAshareQuote(item) {
  const targetUrl = `https://hq.sinajs.cn/list=${encodeURIComponent(getSinaAshareSymbol(item.symbol))}`;
  const response = await fetch(targetUrl, {
    headers: {
      'Referer': 'https://finance.sina.com.cn/',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
  });

  if (!response.ok) throw new Error(`Sina quote failed: ${response.status}`);
  const script = await decodeResponseText(response);
  const match = script.match(/="([^"]*)"/);
  const fields = match ? match[1].split(',') : [];
  const latestPrice = toNumber(fields[3]);
  const previousClose = toNumber(fields[2]);
  const price = latestPrice ?? previousClose;
  if (price === null) return null;
  return {
    market: item.market,
    symbol: item.symbol,
    name: fields[0] || item.symbol,
    price,
    latestPrice,
    previousClose,
    changePct: previousClose ? (price - previousClose) / previousClose * 100 : null,
    currency: 'CNY',
    quoteTime: formatSinaTimestamp(fields[30], fields[31]),
    source: 'sina'
  };
}

async function fetchFundQuotes(items) {
  if (items.length === 0) return { quotes: [], failedItems: [] };

  const chunks = [];
  for (let index = 0; index < items.length; index += 10) {
    chunks.push(items.slice(index, index + 10));
  }

  const results = await Promise.allSettled(chunks.map(fetchFundQuoteChunk));
  return results.reduce((summary, result, index) => {
    if (result.status === 'fulfilled') {
      summary.quotes.push(...result.value.quotes);
      summary.failedItems.push(...result.value.failedItems);
      return summary;
    }

    summary.failedItems.push(...chunks[index].map(formatItemKey));
    return summary;
  }, { quotes: [], failedItems: [] });
}

async function fetchFundQuoteChunk(items) {
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

  const quotes = [];
  const failedItems = [];

  items.forEach(item => {
      const fields = quoteMap.get(item.symbol);
      const estimatedNav = toNumber(fields?.[4]);
      const unitNav = toNumber(fields?.[6]);
      const refreshPrice = unitNav;
      const snapshotUnitNav = unitNav;
      const price = refreshPrice;
      if (!fields || price === null) {
        failedItems.push(formatItemKey(item));
        return;
      }
      const navDate = normalizeDateKey(fields[7]);
      quotes.push({
        market: item.market,
        symbol: item.symbol,
        name: fields[1] || item.symbol,
        price,
        refreshPrice,
        snapshotUnitNav,
        estimatedNav,
        unitNav,
        changePct: toNumber(fields[5] ?? fields[9]),
        currency: 'CNY',
        quoteTime: navDate || fields[7] || new Date().toISOString(),
        navDate,
        source: 'eastmoney'
      });
    });

  return { quotes, failedItems };
}

function getAshareExchangePrefix(symbol) {
  if (['000016', '000300', '000688', '000852', '000905'].includes(symbol)) return '1';
  return /^[56]/.test(symbol) ? '1' : '0';
}

function getSinaAshareSymbol(symbol) {
  return getAshareExchangePrefix(symbol) === '1' ? `sh${symbol}` : `sz${symbol}`;
}

function formatItemKey(item) {
  return `${item.market}:${item.symbol}`;
}

function formatEastmoneyTimestamp(value) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return new Date().toISOString();
  return new Date(seconds * 1000).toISOString();
}

function normalizeDateKey(value) {
  const match = String(value || '').match(/\d{4}-\d{1,2}-\d{1,2}/);
  if (!match) return '';
  const [year, month, day] = match[0].split('-');
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

async function decodeResponseText(response) {
  const buffer = await response.arrayBuffer();
  try {
    return new TextDecoder('gbk').decode(buffer);
  } catch (error) {
    return new TextDecoder('utf-8').decode(buffer);
  }
}

function formatSinaTimestamp(date, time) {
  const dateText = String(date || '');
  const timeText = String(time || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText) || !/^\d{2}:\d{2}:\d{2}$/.test(timeText)) return new Date().toISOString();
  return `${dateText}T${timeText}+08:00`;
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
