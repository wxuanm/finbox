import { state } from '../config/state.js';
import { t } from '../config/i18n.js';
import { escapeHtml, formatMoney, formatPercent, formatRatio, trendClass } from '../utils/formatter.js';

const charts = new Map(); // element id -> echarts instance
let resizeBound = false;

/**
 * Renders the last run into `container`.
 * state.lastRun = {
 *   results: [{ id, name, colorVar, isBenchmark, rebalanceLabel, run, metrics, assets: [{ key, code, name }] }],
 *   notices: string[], errors: string[]
 * }
 * Portfolios come first; the benchmark, when present, is last and has isBenchmark = true.
 */
export function renderResults(container) {
    const lang = state.lang;
    const lastRun = state.lastRun;
    disposeCharts();

    if (!lastRun) {
        container.innerHTML = `<p class="empty-state">${escapeHtml(t(lang, 'resultsEmpty'))}</p>`;
        return;
    }

    const { results, notices, errors } = lastRun;
    const messages = [
        ...errors.map(message => `<p class="message error">${escapeHtml(message)}</p>`),
        ...notices.map(message => `<p class="message notice">${escapeHtml(message)}</p>`)
    ].join('');

    if (results.length === 0) {
        container.innerHTML = messages || `<p class="empty-state">${escapeHtml(t(lang, 'resultsEmpty'))}</p>`;
        return;
    }

    const hasECharts = typeof globalThis.echarts !== 'undefined';
    const chartBlock = (id, titleKey, extraClass = '') => `
        <section class="result-block">
            <h3>${escapeHtml(t(lang, titleKey))}</h3>
            ${hasECharts
                ? `<div class="chart ${extraClass}" id="${id}" role="img" aria-label="${escapeHtml(t(lang, titleKey))}"></div>`
                : `<p class="message notice">${escapeHtml(t(lang, 'chartUnavailable'))}</p>`}
        </section>`;
    const portfolios = results.filter(result => !result.isBenchmark);

    container.innerHTML = `
        ${messages}
        <div class="table-scroll">
            <table class="data-table metrics-table">
                <thead>
                    <tr>
                        <th>${escapeHtml(t(lang, 'colPortfolio'))}</th>
                        <th>${escapeHtml(t(lang, 'colPeriod'))}</th>
                        <th class="num">${escapeHtml(t(lang, 'colFinalValue'))}</th>
                        <th class="num">${escapeHtml(t(lang, 'colTotalReturn'))}</th>
                        <th class="num">${escapeHtml(t(lang, 'colCagr'))}</th>
                        <th class="num">${escapeHtml(t(lang, 'colMaxDrawdown'))}</th>
                        <th class="num">${escapeHtml(t(lang, 'colVolatility'))}</th>
                        <th class="num">${escapeHtml(t(lang, 'colSharpe'))}</th>
                        <th class="num">${escapeHtml(t(lang, 'colCalmar'))}</th>
                        <th class="num">${escapeHtml(t(lang, 'colBestYear'))}</th>
                        <th class="num">${escapeHtml(t(lang, 'colWorstYear'))}</th>
                    </tr>
                </thead>
                <tbody>${results.map(result => renderMetricsRow(result, lang)).join('')}</tbody>
            </table>
        </div>
        ${chartBlock('navChart', 'chartNavTitle')}
        ${chartBlock('drawdownChart', 'chartDrawdownTitle', 'chart-short')}
        ${chartBlock('yearlyChart', 'chartYearlyTitle', 'chart-short')}
        <section class="result-block">
            <h3>${escapeHtml(t(lang, 'yearlyTableTitle'))}</h3>
            ${renderYearlyTable(results, lang)}
        </section>
        <section class="result-block">
            <h3>${escapeHtml(t(lang, 'assetsTitle'))}</h3>
            ${portfolios.map(result => renderAssetsTable(result, lang)).join('')}
        </section>`;

    if (!hasECharts) return;
    const palette = readPalette();
    renderNavChart(container.querySelector('#navChart'), results, lang, palette);
    renderDrawdownChart(container.querySelector('#drawdownChart'), results, lang, palette);
    renderYearlyChart(container.querySelector('#yearlyChart'), results, lang, palette);
    bindResize();
}

function renderMetricsRow(result, lang) {
    const { metrics, run } = result;
    const finalValue = run.values[run.values.length - 1];
    const sub = result.isBenchmark
        ? t(lang, 'benchmarkTag')
        : `${result.rebalanceLabel}${run.rebalanceDates.length ? ` · ${t(lang, 'rebalanceCount', { count: run.rebalanceDates.length })}` : ''}`;
    const yearCell = item => (item
        ? `<td class="num ${trendClass(item.return)}"><span class="row-sub-inline">${escapeHtml(item.year)}</span> ${formatPercent(item.return)}</td>`
        : '<td class="num">--</td>');

    return `
        <tr class="${result.isBenchmark ? 'benchmark-row' : ''}">
            <th scope="row">
                <span class="series-dot ${result.isBenchmark ? 'dashed' : ''}" style="--dot: var(${result.colorVar})"></span>${escapeHtml(result.name)}
                <span class="row-sub">${escapeHtml(sub)}</span>
            </th>
            <td class="nowrap">${escapeHtml(metrics.startDate)} → ${escapeHtml(metrics.endDate)}</td>
            <td class="num">${escapeHtml(formatMoney(finalValue, lang))}</td>
            <td class="num ${trendClass(metrics.totalReturn)}">${formatPercent(metrics.totalReturn)}</td>
            <td class="num ${trendClass(metrics.cagr)}">${formatPercent(metrics.cagr)}</td>
            <td class="num down" title="${escapeHtml(t(lang, 'drawdownRange', { from: metrics.maxDrawdownPeak, to: metrics.maxDrawdownTrough }))}">${formatPercent(metrics.maxDrawdown, { signed: false })}</td>
            <td class="num">${formatPercent(metrics.volatility, { signed: false })}</td>
            <td class="num">${formatRatio(metrics.sharpe)}</td>
            <td class="num">${formatRatio(metrics.calmar)}</td>
            ${yearCell(metrics.bestYear)}
            ${yearCell(metrics.worstYear)}
        </tr>`;
}

function renderYearlyTable(results, lang) {
    const years = collectYears(results);
    const lookup = results.map(result => new Map(result.metrics.yearly.map(item => [item.year, item])));
    return `
        <div class="table-scroll">
            <table class="data-table yearly-table">
                <thead>
                    <tr>
                        <th>${escapeHtml(t(lang, 'colYear'))}</th>
                        ${results.map(result => `<th class="num"><span class="series-dot ${result.isBenchmark ? 'dashed' : ''}" style="--dot: var(${result.colorVar})"></span>${escapeHtml(result.name)}</th>`).join('')}
                    </tr>
                </thead>
                <tbody>
                    ${years.map(year => `
                        <tr>
                            <th scope="row">${escapeHtml(year)}${lookup.some(map => map.get(year)?.partial) ? `<span class="row-sub-inline" title="${escapeHtml(t(lang, 'partialYearHint'))}"> *</span>` : ''}</th>
                            ${lookup.map(map => {
                                const item = map.get(year);
                                return item
                                    ? `<td class="num ${trendClass(item.return)}">${formatPercent(item.return)}</td>`
                                    : '<td class="num">--</td>';
                            }).join('')}
                        </tr>`).join('')}
                </tbody>
            </table>
        </div>
        ${years.length && results.some(result => result.metrics.yearly.some(item => item.partial))
            ? `<p class="table-note">* ${escapeHtml(t(lang, 'partialYearHint'))}</p>` : ''}`;
}

function renderAssetsTable(result, lang) {
    const { run } = result;
    return `
        <details class="asset-detail" open>
            <summary><span class="series-dot" style="--dot: var(${result.colorVar})"></span>${escapeHtml(result.name)}</summary>
            <div class="table-scroll">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>${escapeHtml(t(lang, 'colAsset'))}</th>
                            <th class="num">${escapeHtml(t(lang, 'colStartWeight'))}</th>
                            <th class="num">${escapeHtml(t(lang, 'colEndWeight'))}</th>
                            <th class="num">${escapeHtml(t(lang, 'colAssetReturn'))}</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${result.assets.map((asset, i) => `
                            <tr>
                                <th scope="row"><span class="code">${escapeHtml(asset.code)}</span> ${escapeHtml(asset.name)}</th>
                                <td class="num">${formatPercent(run.startWeights[i], { signed: false })}</td>
                                <td class="num">${formatPercent(run.endWeights[i], { signed: false })}</td>
                                <td class="num ${trendClass(run.assetReturns[i])}">${formatPercent(run.assetReturns[i])}</td>
                            </tr>`).join('')}
                    </tbody>
                </table>
            </div>
        </details>`;
}

// ---------- charts ----------

function readPalette() {
    const css = getComputedStyle(document.documentElement);
    const color = name => css.getPropertyValue(name).trim();
    return {
        color,
        text: color('--text-color'),
        muted: color('--muted-text'),
        border: color('--border-color'),
        surface: color('--surface-color')
    };
}

function baseOption(lang, palette, valueFormatter) {
    return {
        animation: false,
        grid: { left: 8, right: 16, top: 36, bottom: 12, containLabel: true },
        legend: { top: 0, type: 'scroll', textStyle: { color: palette.text } },
        tooltip: {
            trigger: 'axis',
            confine: true,
            backgroundColor: palette.surface,
            borderColor: palette.border,
            textStyle: { color: palette.text },
            valueFormatter
        },
        yAxis: {
            type: 'value',
            scale: true,
            axisLabel: { color: palette.muted, formatter: value => `${value}%` },
            splitLine: { lineStyle: { color: palette.border, opacity: 0.6 } }
        }
    };
}

function timeAxis(palette) {
    return {
        type: 'time',
        axisLine: { lineStyle: { color: palette.border } },
        axisLabel: { color: palette.muted, hideOverlap: true }
    };
}

function lineSeries(result, palette, data, extra = {}) {
    const color = palette.color(result.colorVar);
    return {
        name: result.name,
        type: 'line',
        showSymbol: false,
        sampling: 'lttb',
        color,
        lineStyle: { width: result.isBenchmark ? 1.5 : 2, type: result.isBenchmark ? 'dashed' : 'solid', color },
        data,
        ...extra
    };
}

const pctFormatter = value => (Number.isFinite(value) ? `${value > 0 ? '+' : ''}${value.toFixed(2)}%` : '--');

function renderNavChart(el, results, lang, palette) {
    const chart = initChart(el, lang);
    if (!chart) return;
    chart.setOption({
        ...baseOption(lang, palette, pctFormatter),
        grid: { left: 8, right: 16, top: 36, bottom: 64, containLabel: true },
        xAxis: timeAxis(palette),
        dataZoom: [
            { type: 'inside', filterMode: 'none' },
            { type: 'slider', height: 22, bottom: 10, filterMode: 'none', borderColor: palette.border, textStyle: { color: palette.muted } }
        ],
        series: results.map(result => lineSeries(result, palette,
            result.run.dates.map((date, i) => [date, round((result.run.nav[i] - 1) * 100)])))
    });
}

function renderDrawdownChart(el, results, lang, palette) {
    const chart = initChart(el, lang);
    if (!chart) return;
    const option = baseOption(lang, palette, value => (Number.isFinite(value) ? `${value.toFixed(2)}%` : '--'));
    option.yAxis = { ...option.yAxis, max: 0, scale: false };
    chart.setOption({
        ...option,
        xAxis: timeAxis(palette),
        dataZoom: [{ type: 'inside', filterMode: 'none' }],
        series: results.map(result => lineSeries(result, palette,
            result.run.dates.map((date, i) => [date, round(result.metrics.drawdownSeries[i] * 100)]),
            result.isBenchmark ? {} : { areaStyle: { opacity: 0.08 } }))
    });
}

function renderYearlyChart(el, results, lang, palette) {
    const chart = initChart(el, lang);
    if (!chart) return;
    const years = collectYears(results);
    chart.setOption({
        ...baseOption(lang, palette, pctFormatter),
        tooltip: { ...baseOption(lang, palette, pctFormatter).tooltip, axisPointer: { type: 'shadow' } },
        xAxis: {
            type: 'category',
            data: years,
            axisLine: { lineStyle: { color: palette.border } },
            axisLabel: { color: palette.muted }
        },
        series: results.map(result => {
            const color = palette.color(result.colorVar);
            const byYear = new Map(result.metrics.yearly.map(item => [item.year, item.return]));
            return {
                name: result.name,
                type: 'bar',
                color,
                barMaxWidth: 18,
                itemStyle: result.isBenchmark
                    ? { color: 'transparent', borderColor: color, borderWidth: 1.5, borderType: 'dashed' }
                    : { color },
                data: years.map(year => (byYear.has(year) ? round(byYear.get(year) * 100) : null))
            };
        })
    });
}

function collectYears(results) {
    return [...new Set(results.flatMap(result => result.metrics.yearly.map(item => item.year)))].sort();
}

function initChart(el, lang) {
    if (!el) return null;
    const chart = globalThis.echarts.init(el, null, { renderer: 'canvas', locale: lang === 'en' ? 'EN' : 'ZH' });
    charts.set(el.id, chart);
    return chart;
}

function bindResize() {
    if (resizeBound) return;
    resizeBound = true;
    window.addEventListener('resize', () => charts.forEach(chart => chart.resize()));
}

function disposeCharts() {
    charts.forEach(chart => chart.dispose());
    charts.clear();
}

function round(value) {
    return Number(value.toFixed(4));
}
