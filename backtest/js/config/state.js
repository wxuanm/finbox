import { CONFIG_KEY, PREFERENCES_KEY, readPayload, writePayload } from '../utils/storage.js';
import { REBALANCE_MODES } from '../engine/backtestEngine.js';

const MARKETS = ['CN', 'Fund'];
export const MAX_PORTFOLIOS = 3;

// Must stay within the INDEX_SECIDS allowlist in functions/api/history.js.
export const BENCHMARKS = [
    { code: '000300', zh: '沪深300', en: 'CSI 300' },
    { code: '000905', zh: '中证500', en: 'CSI 500' },
    { code: '000852', zh: '中证1000', en: 'CSI 1000' },
    { code: '000016', zh: '上证50', en: 'SSE 50' },
    { code: '000001', zh: '上证指数', en: 'SSE Composite' },
    { code: '399006', zh: '创业板指', en: 'ChiNext' }
];

export function defaultParams() {
    const end = new Date();
    const start = new Date(end);
    start.setFullYear(start.getFullYear() - 5);
    return {
        start: toDateKey(start),
        end: toDateKey(end),
        initialAmount: 100000,
        riskFree: 0,
        benchmark: '000300'
    };
}

export function newPortfolioId() {
    return `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function defaultPortfolio(index = 1) {
    return {
        id: newPortfolioId(),
        name: '',
        rebalance: 'quarterly',
        assets: [
            { market: 'CN', code: '600519', weight: 50 },
            { market: 'Fund', code: '110011', weight: 50 }
        ],
        index
    };
}

const prefs = readPayload(PREFERENCES_KEY, {});
const savedConfig = readPayload(CONFIG_KEY, null);

export const state = {
    lang: prefs.lang === 'en' ? 'en' : 'zh',
    theme: prefs.theme === 'dark' ? 'dark' : 'light',
    params: sanitizeParams(savedConfig?.params),
    portfolios: sanitizePortfolios(savedConfig?.portfolios),
    names: {},          // "CN:600519" -> display name resolved from the API
    lastRun: null,      // { results, notices, errors }
    running: false
};

export function savePreferences() {
    writePayload(PREFERENCES_KEY, { lang: state.lang, theme: state.theme });
}

export function saveConfig() {
    writePayload(CONFIG_KEY, { params: state.params, portfolios: state.portfolios });
}

function sanitizeParams(params) {
    const fallback = defaultParams();
    if (!params || typeof params !== 'object') return fallback;
    return {
        start: isDateKey(params.start) ? params.start : fallback.start,
        end: isDateKey(params.end) ? params.end : fallback.end,
        initialAmount: Number(params.initialAmount) > 0 ? Number(params.initialAmount) : fallback.initialAmount,
        riskFree: Number.isFinite(Number(params.riskFree)) ? Number(params.riskFree) : 0,
        benchmark: sanitizeBenchmark(params.benchmark, fallback.benchmark)
    };
}

export function sanitizeBenchmark(value, fallback = '') {
    if (value === '') return '';
    return BENCHMARKS.some(item => item.code === value) ? value : fallback;
}

export function benchmarkLabel(code, lang) {
    const item = BENCHMARKS.find(entry => entry.code === code);
    return item ? item[lang] || item.zh : code;
}

// Keeps `index` (used for default names and series colours) in sync with list order.
export function reindexPortfolios() {
    state.portfolios.forEach((portfolio, i) => {
        portfolio.index = i + 1;
    });
}

function sanitizePortfolios(portfolios) {
    if (!Array.isArray(portfolios) || portfolios.length === 0) return [defaultPortfolio(1)];
    const result = portfolios.slice(0, MAX_PORTFOLIOS).map((portfolio, i) => ({
        id: typeof portfolio?.id === 'string' ? portfolio.id : defaultPortfolio(i + 1).id,
        name: typeof portfolio?.name === 'string' ? portfolio.name.slice(0, 40) : '',
        rebalance: REBALANCE_MODES.includes(portfolio?.rebalance) ? portfolio.rebalance : 'none',
        assets: Array.isArray(portfolio?.assets)
            ? portfolio.assets.slice(0, 20).map(asset => ({
                market: MARKETS.includes(asset?.market) ? asset.market : 'CN',
                code: String(asset?.code ?? '').replace(/\D/g, '').slice(0, 6),
                weight: Number.isFinite(Number(asset?.weight)) ? Number(asset.weight) : 0
            }))
            : [],
        index: i + 1
    }));
    return result;
}

export function isDateKey(value) {
    return /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

export function toDateKey(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}
