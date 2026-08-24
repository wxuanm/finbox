import { StockQuote, StockQuoteResult } from '../types';
import { normalizeStockSymbols } from '../utils/fundCodes';

const REQUEST_TIMEOUT_MS = 12000;
const STOCK_BATCH_SIZE = 20;

export class StockQuoteService {
  async fetchQuotes(inputSymbols: string[]): Promise<StockQuoteResult> {
    const symbols = normalizeStockSymbols(inputSymbols);
    const updatedAt = new Date().toISOString();
    const quotes: StockQuote[] = [];
    const failedSymbols: string[] = [];

    const sinaResults = await Promise.allSettled(chunkItems(symbols, STOCK_BATCH_SIZE).map(chunk => this.fetchSinaAshareQuoteBatch(chunk)));
    sinaResults.forEach(result => {
      if (result.status === 'fulfilled') quotes.push(...result.value);
    });

    const missingSymbols = symbols.filter(symbol => !quotes.some(quote => quote.symbol === symbol));
    const fallbackChunks = chunkItems(missingSymbols, STOCK_BATCH_SIZE);
    const fallbackResults = await Promise.allSettled(fallbackChunks.map(chunk => this.fetchEastmoneyAshareQuoteBatch(chunk)));

    fallbackResults.forEach((result, index) => {
      const chunk = fallbackChunks[index];
      if (result.status === 'fulfilled') {
        quotes.push(...result.value);
        const returnedSymbols = new Set(result.value.map(quote => quote.symbol));
        chunk.forEach(symbol => {
          if (!returnedSymbols.has(symbol)) failedSymbols.push(symbol);
        });
      } else {
        failedSymbols.push(...chunk);
      }
    });

    return { quotes, failedSymbols, updatedAt };
  }

  private async fetchSinaAshareQuoteBatch(symbols: string[]): Promise<StockQuote[]> {
    const targetUrl = `https://hq.sinajs.cn/list=${encodeURIComponent(symbols.join(','))}`;
    const response = await fetchWithTimeout(targetUrl, {
      headers: {
        Referer: 'https://finance.sina.com.cn/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    if (!response.ok) throw new Error(`Sina quote failed: ${response.status}`);
    const script = await decodeResponseText(response);
    return parseSinaAshareScript(script);
  }

  private async fetchEastmoneyAshareQuoteBatch(symbols: string[]): Promise<StockQuote[]> {
    const secids = symbols.map(symbol => `${getAshareExchangePrefix(symbol)}.${getAshareCode(symbol)}`).join(',');
    const targetUrl = `https://push2.eastmoney.com/api/qt/ulist.np/get?fltt=2&fields=f12,f13,f14,f2,f3,f4,f5,f6,f15,f16,f17,f18,f86&secids=${encodeURIComponent(secids)}`;
    const response = await fetchWithTimeout(targetUrl, {
      headers: {
        Referer: 'https://quote.eastmoney.com/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    if (!response.ok) throw new Error(`Eastmoney stock quote batch failed: ${response.status}`);
    const data = await response.json();
    const rows = Array.isArray(data?.data?.diff) ? data.data.diff : [];
    return rows
      .map((row: Record<string, unknown>) => normalizeEastmoneyAshareRow(row))
      .filter((quote: StockQuote | null): quote is StockQuote => Boolean(quote));
  }
}

function parseSinaAshareScript(script: string): StockQuote[] {
  const quotes: StockQuote[] = [];
  const pattern = /var\s+hq_str_([a-z]{2}\d{6})="([^"]*)";?/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(script))) {
    const quote = normalizeSinaAshareFields(match[1], match[2].split(','));
    if (quote) quotes.push(quote);
  }
  return quotes;
}

function normalizeSinaAshareFields(symbol: string, fields: string[]): StockQuote | null {
    const latestPrice = toNumber(fields[3]);
    const previousClose = toNumber(fields[2]);
    const price = latestPrice ?? previousClose;
    if (price === null) return null;
    const changeAmount = previousClose ? price - previousClose : null;

    return {
      market: 'CN',
      symbol,
      name: fields[0] || symbol,
      price,
      latestPrice,
      previousClose,
      openPrice: toNumber(fields[1]),
      highPrice: toNumber(fields[4]),
      lowPrice: toNumber(fields[5]),
      changeAmount,
      changePct: previousClose ? (price - previousClose) / previousClose * 100 : null,
      volume: toNumber(fields[8]),
      amount: toNumber(fields[9]),
      currency: 'CNY',
      quoteTime: formatSinaTimestamp(fields[30], fields[31]),
      source: 'sina'
    };
  }

function normalizeEastmoneyAshareRow(row: Record<string, unknown>): StockQuote | null {
    const code = String(row?.f12 || '');
    const symbol = `${String(row?.f13) === '1' ? 'sh' : 'sz'}${code}`;
    const latestPrice = toNumber(row?.f2);
    const previousClose = toNumber(row?.f18);
    const price = latestPrice ?? previousClose;
    if (!row || price === null) return null;

    return {
      market: 'CN',
      symbol,
      name: String(row.f14 || symbol),
      price,
      latestPrice,
      previousClose,
      openPrice: toNumber(row.f17),
      highPrice: toNumber(row.f15),
      lowPrice: toNumber(row.f16),
      changeAmount: toSignedNumber(row.f4),
      changePct: toSignedNumber(row.f3),
      volume: toNumber(row.f5),
      amount: toNumber(row.f6),
      currency: 'CNY',
      quoteTime: formatEastmoneyTimestamp(row.f86),
      source: 'eastmoney'
    };
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function getAshareExchangePrefix(symbol: string): string {
  return symbol.startsWith('sh') ? '1' : '0';
}

function getAshareCode(symbol: string): string {
  return symbol.replace(/^(sh|sz)/, '');
}

function getSinaAshareSymbol(symbol: string): string {
  return getAshareExchangePrefix(symbol) === '1' ? `sh${getAshareCode(symbol)}` : `sz${getAshareCode(symbol)}`;
}

function chunkItems<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

async function decodeResponseText(response: Response): Promise<string> {
  const buffer = await response.arrayBuffer();
  try {
    return new TextDecoder('gbk').decode(buffer);
  } catch (error) {
    return new TextDecoder('utf-8').decode(buffer);
  }
}

function formatEastmoneyTimestamp(value: unknown): string {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return new Date().toISOString();
  return new Date(seconds * 1000).toISOString();
}

function formatSinaTimestamp(date: unknown, time: unknown): string {
  const dateText = String(date || '');
  const timeText = String(time || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText) || !/^\d{2}:\d{2}:\d{2}$/.test(timeText)) return new Date().toISOString();
  return `${dateText}T${timeText}+08:00`;
}

function toNumber(value: unknown): number | null {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? num : null;
}

function toSignedNumber(value: unknown): number | null {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}
