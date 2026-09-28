import { FundFeeTier, FundTradingInfo } from '../types';

const REQUEST_TIMEOUT_MS = 15000;

export class FundTradingService {
  private readonly cache = new Map<string, { dateKey: string; data: FundTradingInfo }>();

  async fetchTradingInfo(code: string): Promise<FundTradingInfo> {
    if (!/^\d{6}$/.test(code)) throw new Error('Invalid fund code');
    const dateKey = getLocalDateKey(new Date());
    const cached = this.cache.get(code);
    if (cached?.dateKey === dateKey) return cached.data;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(`https://fundf10.eastmoney.com/jjfl_${encodeURIComponent(code)}.html`, {
        signal: controller.signal,
        headers: {
          Referer: 'https://fund.eastmoney.com/',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      if (!response.ok) throw new Error(`Eastmoney trading info request failed: ${response.status}`);

      const data = parseFundTradingInfo(code, await response.text());
      this.cache.set(code, { dateKey, data });
      return data;
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function parseFundTradingInfo(code: string, html: string): FundTradingInfo {
  const status = parseKeyValueTable(findTableAfterHeading(html, '交易状态'));
  const limits = parseKeyValueTable(findTableAfterHeading(html, '申购与赎回金额'));
  const holdingFees = parseKeyValueTable(findTableAfterHeading(html, '运作费用'));
  return {
    code,
    purchaseStatus: status.get('申购状态') || null,
    redemptionStatus: status.get('赎回状态') || null,
    dailyPurchaseLimit: limits.get('日累计申购限额') || null,
    purchaseFees: parseFeeTable(findTableAfterHeading(html, '申购费率')),
    holdingFees: ['管理费率', '托管费率', '销售服务费率']
      .map(range => ({ range, rate: holdingFees.get(range) || '' }))
      .filter(item => item.rate),
    redemptionFees: parseFeeTable(findTableAfterHeading(html, '赎回费率')),
    updatedAt: new Date().toISOString()
  };
}

function findTableAfterHeading(html: string, heading: string): string {
  const headingPattern = new RegExp(`<label[^>]*>\\s*${escapeRegExp(heading)}(?:<[^>]+>[^<]*<\\/[^>]+>)?\\s*<\\/label>`, 'i');
  const match = headingPattern.exec(html);
  if (!match || match.index === undefined) return '';
  const tail = html.slice(match.index + match[0].length);
  const table = tail.match(/<table\b[^>]*>[\s\S]*?<\/table>/i);
  return table?.[0] || '';
}

function parseKeyValueTable(table: string): Map<string, string> {
  const values = parseCells(table);
  const pairs = new Map<string, string>();
  for (let index = 0; index + 1 < values.length; index += 2) {
    if (values[index]) pairs.set(values[index], values[index + 1]);
  }
  return pairs;
}

function parseFeeTable(table: string): FundFeeTier[] {
  const body = table.match(/<tbody\b[^>]*>([\s\S]*?)<\/tbody>/i)?.[1] || '';
  return [...body.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)]
    .map(row => parseCells(row[1]))
    .filter(cells => cells.length >= 2 && cells[0] && cells[1])
    .map(cells => ({ range: cells[0], rate: cells[1].replace(/\s*\|\s*/g, ' | ') }));
}

function parseCells(fragment: string): string[] {
  return [...fragment.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(match => cleanHtmlText(match[1]));
}

function cleanHtmlText(value: string): string {
  return decodeHtml(value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim());
}

function decodeHtml(value: string): string {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getLocalDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
