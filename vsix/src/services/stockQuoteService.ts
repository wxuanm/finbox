import { StockQuote, StockQuoteResult } from '../types';
import { normalizeStockSymbols } from '../utils/fundCodes';

const REQUEST_TIMEOUT_MS = 12000;

export class StockQuoteService {
  async fetchQuotes(inputSymbols: string[]): Promise<StockQuoteResult> {
    const symbols = normalizeStockSymbols(inputSymbols);
    const updatedAt = new Date().toISOString();
    const results = await Promise.allSettled(symbols.map(symbol => this.fetchAshareQuote(symbol)));
    const quotes: StockQuote[] = [];
    const failedSymbols: string[] = [];

    results.forEach((result, index) => {
      if (result.status === 'fulfilled' && result.value) {
        quotes.push(result.value);
        return;
      }
      failedSymbols.push(symbols[index]);
    });

    return { quotes, failedSymbols, updatedAt };
  }

  private async fetchAshareQuote(symbol: string): Promise<StockQuote | null> {
    const sinaQuote = await this.fetchSinaAshareQuote(symbol).catch(() => null);
    if (sinaQuote) return sinaQuote;
    return this.fetchEastmoneyAshareQuote(symbol).catch(() => null);
  }

  private async fetchSinaAshareQuote(symbol: string): Promise<StockQuote | null> {
    const targetUrl = `https://hq.sinajs.cn/list=${encodeURIComponent(symbol)}`;
    const response = await fetchWithTimeout(targetUrl, {
      headers: {
        Referer: 'https://finance.sina.com.cn/',
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

  private async fetchEastmoneyAshareQuote(symbol: string): Promise<StockQuote | null> {
    const secid = `${getAshareExchangePrefix(symbol)}.${getAshareCode(symbol)}`;
    const targetUrl = `https://push2.eastmoney.com/api/qt/stock/get?fltt=2&fields=f43,f44,f45,f46,f47,f48,f57,f58,f60,f86,f169,f170&secid=${encodeURIComponent(secid)}`;
    const response = await fetchWithTimeout(targetUrl, {
      headers: {
        Referer: 'https://quote.eastmoney.com/',
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
      market: 'CN',
      symbol,
      name: row.f58 || symbol,
      price,
      latestPrice,
      previousClose,
      openPrice: toNumber(row.f46),
      highPrice: toNumber(row.f44),
      lowPrice: toNumber(row.f45),
      changeAmount: toSignedNumber(row.f169),
      changePct: toSignedNumber(row.f170),
      volume: toNumber(row.f47),
      amount: toNumber(row.f48),
      currency: 'CNY',
      quoteTime: formatEastmoneyTimestamp(row.f86),
      source: 'eastmoney'
    };
  }
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
