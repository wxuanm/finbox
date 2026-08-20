import { FundQuote, FundQuoteResult } from '../types';
import { chunkCodes, normalizeFundCodes } from '../utils/fundCodes';

const MAX_CODES_PER_REQUEST = 10;
const REQUEST_TIMEOUT_MS = 12000;

export class FundQuoteService {
  async fetchQuotes(inputCodes: string[]): Promise<FundQuoteResult> {
    const codes = normalizeFundCodes(inputCodes);
    const updatedAt = new Date().toISOString();
    if (codes.length === 0) return { quotes: [], failedCodes: [], updatedAt };

    const chunks = chunkCodes(codes, MAX_CODES_PER_REQUEST);
    const quotes: FundQuote[] = [];
    const failedCodes = new Set<string>();

    for (const chunk of chunks) {
      try {
        const chunkQuotes = await this.fetchQuoteChunk(chunk, updatedAt);
        quotes.push(...chunkQuotes);
        const returnedCodes = new Set(chunkQuotes.map(quote => quote.code));
        chunk.forEach(code => {
          if (!returnedCodes.has(code)) failedCodes.add(code);
        });
      } catch (error) {
        chunk.forEach(code => failedCodes.add(code));
      }
    }

    return { quotes, failedCodes: [...failedCodes], updatedAt };
  }

  private async fetchQuoteChunk(codes: string[], updatedAt: string): Promise<FundQuote[]> {
    const targetUrl = `https://fund.eastmoney.com/Data/FundCompare_Interface.aspx?t=0&bzdm=${encodeURIComponent(codes.join(','))}&rt=${Date.now()}`;
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

      if (!response.ok) {
        throw new Error(`Eastmoney quote request failed: ${response.status}`);
      }

      return parseFundInfoScript(await response.text(), updatedAt);
    } finally {
      clearTimeout(timeout);
    }
  }
}

function parseFundInfoScript(script: string, updatedAt: string): FundQuote[] {
  const match = script.match(/var\s+fundinfo\s*=\s*(\[[\s\S]*?\]);?/);
  if (!match) return [];

  const parsed = JSON.parse(match[1]) as unknown;
  if (!Array.isArray(parsed)) return [];

  return parsed
    .map(item => normalizeFundInfoItem(String(item), updatedAt))
    .filter((item): item is FundQuote => Boolean(item));
}

function normalizeFundInfoItem(item: string, updatedAt: string): FundQuote | null {
  const fields = item.split(',');
  const [
    code,
    name,
    ,
    ,
    estimatedNav,
    estimatedChange,
    unitNav,
    unitNavDate,
    accumulatedNav,
    navChange,
    previousNav,
    previousNavDate,
    manager
  ] = fields;

  const normalizedCode = String(code || '').trim();
  if (!/^\d{6}$/.test(normalizedCode)) return null;

  return {
    code: normalizedCode,
    name: name || normalizedCode,
    estimatedNav: estimatedNav || '',
    estimatedChange: toNumber(estimatedChange),
    unitNav: unitNav || '',
    unitNavDate: unitNavDate || '',
    accumulatedNav: accumulatedNav || '',
    navChange: toNumber(navChange),
    previousNav: previousNav || '',
    previousNavDate: previousNavDate || '',
    manager: manager || '',
    source: 'eastmoney',
    updatedAt
  };
}

function toNumber(value: unknown): number | null {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
}
