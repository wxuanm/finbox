import {
    state,
    saveConfig,
    savePreferences,
    defaultParams,
    defaultPortfolio,
    newPortfolioId,
    reindexPortfolios,
    sanitizeBenchmark,
    benchmarkLabel,
    isDateKey,
    toDateKey,
    BENCHMARKS,
    MAX_PORTFOLIOS
} from './config/state.js';
import { i18n, t } from './config/i18n.js';
import { fetchHistory, itemKey } from './api/historyApi.js';
import { runBacktest, BacktestError } from './engine/backtestEngine.js';
import { computeMetrics } from './engine/metrics.js';
import {
    bindPortfolioEditor,
    portfolioDisplayName,
    renderPortfolioEditor,
    seriesColorVar,
    validatePortfolio
} from './ui/portfolioEditor.js';
import { renderResults } from './ui/results.js';

// Tried in order: cdnjs first, unpkg as backup. Each source gets its own timeout.
const ECHARTS_SOURCES = [
    'https://cdnjs.cloudflare.com/ajax/libs/echarts/5.6.0/echarts.min.js',
    'https://unpkg.com/echarts@5.6.0/dist/echarts.min.js'
];
const ECHARTS_LOAD_TIMEOUT_MS = 10000;
const BENCHMARK_COLOR_VAR = '--chart-benchmark';
const REBALANCE_LABEL_KEYS = {
    none: 'rebalanceNone',
    monthly: 'rebalanceMonthly',
    quarterly: 'rebalanceQuarterly',
    yearly: 'rebalanceYearly'
};
const PRESET_YEARS = { '1y': 1, '3y': 3, '5y': 5, '10y': 10, max: 25 };

const els = {};

init();

async function init() {
    els.portfolios = document.getElementById('portfolioList');
    els.results = document.getElementById('resultsBody');
    els.runBtn = document.getElementById('runBtn');
    els.runError = document.getElementById('runError');
    els.start = document.getElementById('startDate');
    els.end = document.getElementById('endDate');
    els.amount = document.getElementById('initialAmount');
    els.riskFree = document.getElementById('riskFree');
    els.benchmark = document.getElementById('benchmark');

    applyTheme();
    applyLanguage();
    renderParams();
    renderPortfolios();
    renderResults(els.results);
    bindEvents();

    await loadECharts();
    if (state.lastRun) renderResults(els.results);
}

function bindEvents() {
    document.getElementById('themeBtn').addEventListener('click', () => {
        state.theme = state.theme === 'light' ? 'dark' : 'light';
        savePreferences();
        applyTheme();
        // Charts read CSS variables at render time, so re-render after the theme flips.
        renderResults(els.results);
    });
    document.getElementById('langBtn').addEventListener('click', () => {
        state.lang = state.lang === 'zh' ? 'en' : 'zh';
        savePreferences();
        applyLanguage();
        renderBenchmarkOptions();
        renderPortfolios();
        relabelLastRun();
        renderResults(els.results);
    });

    [els.start, els.end, els.amount, els.riskFree, els.benchmark].forEach(input => {
        input.addEventListener('change', readParams);
    });
    document.getElementById('presetGroup').addEventListener('click', event => {
        const button = event.target.closest('[data-preset]');
        if (!button) return;
        applyPreset(button.dataset.preset);
    });

    bindPortfolioEditor(els.portfolios, {
        getPortfolio: id => state.portfolios.find(portfolio => portfolio.id === id),
        onChange: (portfolio, { structural }) => {
            saveConfig();
            setRunError('');
            if (structural) renderPortfolios();
        },
        onPortfolioAction: handlePortfolioAction
    });

    els.runBtn.addEventListener('click', run);
}

function handlePortfolioAction(action, portfolio) {
    if (action === 'add' && state.portfolios.length < MAX_PORTFOLIOS) {
        const next = defaultPortfolio(state.portfolios.length + 1);
        next.assets = [{ market: 'CN', code: '', weight: 100 }];
        state.portfolios.push(next);
    } else if (action === 'duplicate' && portfolio && state.portfolios.length < MAX_PORTFOLIOS) {
        const copy = {
            ...portfolio,
            id: newPortfolioId(),
            name: portfolio.name ? `${portfolio.name} ${t(state.lang, 'copySuffix')}`.slice(0, 40) : '',
            assets: portfolio.assets.map(asset => ({ ...asset }))
        };
        state.portfolios.splice(state.portfolios.indexOf(portfolio) + 1, 0, copy);
    } else if (action === 'remove' && portfolio && state.portfolios.length > 1) {
        state.portfolios.splice(state.portfolios.indexOf(portfolio), 1);
    } else {
        return;
    }
    reindexPortfolios();
    saveConfig();
    setRunError('');
    renderPortfolios();
}

function renderParams() {
    els.start.value = state.params.start;
    els.end.value = state.params.end;
    els.amount.value = state.params.initialAmount;
    els.riskFree.value = state.params.riskFree;
    renderBenchmarkOptions();
}

function renderBenchmarkOptions() {
    const lang = state.lang;
    els.benchmark.innerHTML = [
        `<option value="">${escapeOption(t(lang, 'benchmarkNone'))}</option>`,
        ...BENCHMARKS.map(item => `<option value="${item.code}">${escapeOption(item[lang] || item.zh)}</option>`)
    ].join('');
    els.benchmark.value = state.params.benchmark;
}

function readParams() {
    const fallback = defaultParams();
    state.params = {
        start: isDateKey(els.start.value) ? els.start.value : fallback.start,
        end: isDateKey(els.end.value) ? els.end.value : fallback.end,
        initialAmount: Number(els.amount.value) > 0 ? Number(els.amount.value) : state.params.initialAmount,
        riskFree: Number.isFinite(Number(els.riskFree.value)) ? Number(els.riskFree.value) : 0,
        benchmark: sanitizeBenchmark(els.benchmark.value, '')
    };
    saveConfig();
}

function applyPreset(preset) {
    const years = PRESET_YEARS[preset];
    if (!years) return;
    const end = new Date();
    const start = new Date(end);
    start.setFullYear(start.getFullYear() - years);
    els.end.value = toDateKey(end);
    els.start.value = toDateKey(start);
    readParams();
}

function renderPortfolios() {
    const canAdd = state.portfolios.length < MAX_PORTFOLIOS;
    const canRemove = state.portfolios.length > 1;
    els.portfolios.innerHTML = [
        ...state.portfolios.map(() => '<div class="portfolio-slot"></div>'),
        canAdd
            ? `<button type="button" class="add-portfolio-btn" data-action="add-portfolio">+ ${escapeOption(t(state.lang, 'addPortfolio', { count: state.portfolios.length, max: MAX_PORTFOLIOS }))}</button>`
            : ''
    ].join('');
    [...els.portfolios.querySelectorAll('.portfolio-slot')].forEach((slot, i) => {
        renderPortfolioEditor(slot, state.portfolios[i], { canAdd, canRemove });
    });
}

async function run() {
    if (state.running) return;
    readParams();
    const lang = state.lang;
    const { start, end, initialAmount, riskFree, benchmark } = state.params;

    if (start >= end) return setRunError(t(lang, 'errDates'));
    if (!(initialAmount > 0)) return setRunError(t(lang, 'errAmount'));
    for (const portfolio of state.portfolios) {
        const errors = validatePortfolio(portfolio, lang);
        if (errors.length) {
            return setRunError(t(lang, 'scoped', { name: portfolioDisplayName(portfolio, lang), message: errors.join(' ') }));
        }
    }
    setRunError('');
    setRunning(true);

    try {
        const benchmarkKey = benchmark ? itemKey('Index', benchmark) : null;
        const keys = [
            ...state.portfolios.flatMap(portfolio => portfolio.assets.map(asset => itemKey(asset.market, asset.code))),
            ...(benchmarkKey ? [benchmarkKey] : [])
        ];
        const { series, failed } = await fetchHistory(keys, start);
        Object.entries(series).forEach(([key, item]) => {
            state.names[key] = item.name;
        });
        state.lastRun = buildRun({ series, failed, benchmarkKey, start, end, initialAmount, riskFree, lang });
    } catch (error) {
        state.lastRun = { results: [], notices: [], errors: [t(lang, 'errFetch', { message: error.message })] };
    } finally {
        setRunning(false);
    }

    renderPortfolios(); // show resolved asset names
    renderResults(els.results);
}

/**
 * Two passes: each portfolio first runs on the requested range to find its own
 * effective start. All portfolios and the benchmark are then re-run from the
 * latest of those starts so their metrics and curves share one period.
 */
function buildRun({ series, failed, benchmarkKey, start, end, initialAmount, riskFree, lang }) {
    const failedKeys = new Set(failed.map(item => item.key));
    const errors = [];
    const notices = [];
    if (failed.length) {
        errors.push(t(lang, 'errFailedItems', { items: failed.map(item => labelForKey(item.key)).join(t(lang, 'listSeparator')) }));
    }
    const prices = Object.fromEntries(Object.entries(series).map(([key, item]) => [key, item.points]));

    const candidates = [];
    state.portfolios.forEach(portfolio => {
        const name = portfolioDisplayName(portfolio, lang);
        const assets = portfolio.assets.map(asset => {
            const key = itemKey(asset.market, asset.code);
            return { key, code: asset.code, name: state.names[key] || '', weight: Number(asset.weight) };
        });
        if (assets.some(asset => failedKeys.has(asset.key))) {
            errors.push(t(lang, 'scoped', { name, message: t(lang, 'errPortfolioSkipped') }));
            return;
        }
        try {
            const probe = runBacktest({ assets, prices, start, end, initialAmount, rebalance: portfolio.rebalance });
            if (probe.lateAssets.length) {
                notices.push(t(lang, 'scoped', {
                    name,
                    message: t(lang, 'noticeLateStart', {
                        assets: probe.lateAssets.map(labelForKey).join(t(lang, 'listSeparator')),
                        date: probe.effectiveStart
                    })
                }));
            }
            candidates.push({ portfolio, name, assets, probe });
        } catch (error) {
            errors.push(t(lang, 'scoped', { name, message: describeBacktestError(error, lang) }));
        }
    });

    if (candidates.length === 0) return { results: [], notices, errors };

    const starts = candidates.map(item => item.probe.effectiveStart);
    const commonStart = starts.reduce((a, b) => (b > a ? b : a));
    const commonEnd = candidates.map(item => item.probe.effectiveEnd).reduce((a, b) => (b < a ? b : a));
    if (candidates.length > 1 && starts.some(date => date !== commonStart)) {
        notices.push(t(lang, 'noticeAligned', { date: commonStart }));
    }

    const results = [];
    candidates.forEach(({ portfolio, name, assets, probe }) => {
        try {
            const aligned = probe.effectiveStart === commonStart && probe.effectiveEnd === commonEnd
                ? probe
                : runBacktest({ assets, prices, start: commonStart, end: commonEnd, initialAmount, rebalance: portfolio.rebalance });
            results.push({
                id: portfolio.id,
                name,
                rebalance: portfolio.rebalance,
                rebalanceLabel: t(lang, REBALANCE_LABEL_KEYS[portfolio.rebalance]),
                colorVar: seriesColorVar(portfolio),
                isBenchmark: false,
                assets,
                run: aligned,
                metrics: computeMetrics(aligned.dates, aligned.nav, riskFree / 100)
            });
        } catch (error) {
            errors.push(t(lang, 'scoped', { name, message: describeBacktestError(error, lang) }));
        }
    });

    if (benchmarkKey && results.length) {
        const label = benchmarkLabel(benchmarkKey.split(':')[1], lang);
        if (failedKeys.has(benchmarkKey) || !prices[benchmarkKey]) {
            if (!failedKeys.has(benchmarkKey)) errors.push(t(lang, 'errBenchmark', { name: label }));
        } else {
            try {
                const benchRun = runBacktest({
                    assets: [{ key: benchmarkKey, weight: 1 }],
                    prices,
                    start: commonStart,
                    end: commonEnd,
                    initialAmount,
                    rebalance: 'none'
                });
                results.push({
                    id: 'benchmark',
                    benchmarkCode: benchmarkKey.split(':')[1],
                    name: label,
                    isBenchmark: true,
                    colorVar: BENCHMARK_COLOR_VAR,
                    assets: [],
                    run: benchRun,
                    metrics: computeMetrics(benchRun.dates, benchRun.nav, riskFree / 100)
                });
            } catch (error) {
                errors.push(t(lang, 'scoped', { name: label, message: describeBacktestError(error, lang) }));
            }
        }
    }

    return { results, notices, errors };
}

function describeBacktestError(error, lang) {
    if (error instanceof BacktestError) {
        if (error.code === 'noOverlap') return t(lang, 'errNoOverlap');
        if (error.code === 'noData') return t(lang, 'errNoData', { code: labelForKey(error.detail.key) });
        if (error.code === 'noAssets') return t(lang, 'errNoAssets');
    }
    return String(error?.message || error);
}

function labelForKey(key) {
    const [market, code = key] = key.split(':');
    if (market === 'Index') return benchmarkLabel(code, state.lang);
    const name = state.names[key];
    return name ? `${name}(${code})` : code;
}

// Names and labels are baked into results at run time; refresh them on language switch.
// Messages are not re-translated; they refresh on the next run.
function relabelLastRun() {
    if (!state.lastRun) return;
    state.lastRun.results.forEach(result => {
        if (result.isBenchmark) {
            result.name = benchmarkLabel(result.benchmarkCode, state.lang);
            return;
        }
        const portfolio = state.portfolios.find(item => item.id === result.id);
        if (portfolio) result.name = portfolioDisplayName(portfolio, state.lang);
        result.rebalanceLabel = t(state.lang, REBALANCE_LABEL_KEYS[result.rebalance]);
    });
}

function setRunning(running) {
    state.running = running;
    els.runBtn.disabled = running;
    els.runBtn.textContent = t(state.lang, running ? 'running' : 'runBacktest');
}

function setRunError(message) {
    els.runError.textContent = message;
    els.runError.hidden = !message;
}

function applyTheme() {
    document.documentElement.setAttribute('data-theme', state.theme);
    const button = document.getElementById('themeBtn');
    button.title = t(state.lang, state.theme === 'light' ? 'themeDark' : 'themeLight');
    button.setAttribute('aria-label', button.title);
    button.innerHTML = state.theme === 'light'
        ? '<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"></path></svg>'
        : '<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"></path></svg>';
}

function applyLanguage() {
    const lang = state.lang;
    document.documentElement.lang = lang === 'en' ? 'en' : 'zh-CN';
    document.title = t(lang, 'title');
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.dataset.i18n;
        if (i18n[lang][key] !== undefined) el.textContent = t(lang, key);
    });
    document.getElementById('langBtn').textContent = lang === 'zh' ? 'EN' : '中';
    if (!state.running) els.runBtn.textContent = t(lang, 'runBacktest');
    applyTheme();
}

function escapeOption(value) {
    return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function loadECharts() {
    if (globalThis.echarts) return Promise.resolve();
    return ECHARTS_SOURCES.reduce(
        (chain, src) => chain.then(() => (globalThis.echarts ? undefined : loadEChartsScript(src))),
        Promise.resolve()
    );
}

function loadEChartsScript(src) {
    return new Promise(resolve => {
        let settled = false;
        let timer = null;
        const finish = () => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            resolve();
        };
        const script = document.createElement('script');
        script.src = src;
        script.referrerPolicy = 'no-referrer';
        script.onload = finish;
        script.onerror = finish;
        document.head.appendChild(script);
        timer = setTimeout(finish, ECHARTS_LOAD_TIMEOUT_MS);
    });
}
