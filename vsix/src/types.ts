export interface FundGroup {
  id: string;
  name: string;
}

export interface FundMonitorPreferences {
  refreshIntervalMinutes?: number;
  themeMode?: 'vscode' | 'light' | 'dark';
}

export interface PersistedFundMonitorState {
  schemaVersion: 1;
  groups: FundGroup[];
  fundGroups: Record<string, string>;
  stockSymbols: string[];
  preferences: FundMonitorPreferences;
}

export interface FundQuote {
  code: string;
  name: string;
  estimatedNav: string;
  estimatedChange: number | null;
  unitNav: string;
  unitNavDate: string;
  accumulatedNav: string;
  navChange: number | null;
  previousNav: string;
  previousNavDate: string;
  manager: string;
  source: 'eastmoney';
  updatedAt: string;
}

export interface FundQuoteResult {
  quotes: FundQuote[];
  failedCodes: string[];
  updatedAt: string;
}

export interface StockQuote {
  market: 'CN';
  symbol: string;
  name: string;
  price: number;
  latestPrice: number | null;
  previousClose: number | null;
  openPrice: number | null;
  highPrice: number | null;
  lowPrice: number | null;
  changeAmount: number | null;
  changePct: number | null;
  volume: number | null;
  amount: number | null;
  currency: 'CNY';
  quoteTime: string;
  source: 'sina' | 'eastmoney';
}

export interface StockQuoteResult {
  quotes: StockQuote[];
  failedSymbols: string[];
  updatedAt: string;
}

export interface FundNavItem {
  date: string;
  unitNav: number | null;
  accNav: number | null;
  dailyReturn: number | null;
}

export interface FundNav {
  code: string;
  name: string;
  manager: string;
  scale: null | {
    date: string;
    value: number;
  };
  items: FundNavItem[];
}

export interface FundNavResponse {
  range: '3y';
  source: 'eastmoney';
  updatedAt: string;
  funds: FundNav[];
  failedCodes: string[];
}

export interface SidebarState {
  groups: FundGroup[];
  fundGroups: Record<string, string>;
  quotes: Record<string, FundQuote>;
  failedCodes: string[];
  updatedAt: string;
}

export interface StockSidebarState {
  stockSymbols: string[];
  quotes: Record<string, StockQuote>;
  failedSymbols: string[];
  updatedAt: string;
}

export interface NavMetricPeriod {
  returnValue: number | null;
  maxDrawdown: number | null;
  annualizedVolatility: number | null;
  calmarRatio: number | null;
  upDayRatio: number | null;
}

export interface NavMetric {
  code: string;
  name: string;
  manager: string;
  scale: FundNav['scale'];
  latestDate: string;
  oneYearReturn: number;
  periods: Record<string, NavMetricPeriod>;
  maxDrawdown: number;
  series: Array<[string, number]>;
  chartSeries: Record<string, Array<[string, number]>>;
}
