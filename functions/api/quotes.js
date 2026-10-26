import { fetchQuotes } from './_lib/quoteSources.js';

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

  const { quotes, failedItems } = await fetchQuotes(items);

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
