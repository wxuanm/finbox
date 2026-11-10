import { state } from '../config/state.js';
import { t } from '../config/i18n.js';
import { escapeHtml, formatMoney, formatPercent, formatRatio, trendClass } from '../utils/formatter.js';

let navChart = null;
let resizeBound = false;

/**
 * Renders the last run into `container`.
 * state.lastRun = { results: [{ id, name, colorVar, run, metrics, assets: [{ key, code, name }] }], notices: [], errors: [] }
 */
export function renderResults(container) {
    const lang = state.lang;
    const lastRun = state.lastRun;

    if (!lastRun) {
        disposeChart();
        container.innerHTML = `<p class="empty-state">${escapeHtml(t(lang, 'resultsEmpty'))}</p>`;
        return;
    }

    const { results, notices, errors } = lastRun;
    const messages = [
        ...errors.map(message => `<p class="message error">${escapeHtml(message)}</p>`),
        ...notices.map(message => `<p class="message notice">${escapeHtml(message)}</p>`)
    ].join('');

    if (results.length === 0) {
        disposeChart();
        container.innerHTML = messages || `<p class="empty-state">${escapeHtml(t(lang, 'resultsEmpty'))}</p>`;
        return;
    }

    const hasECharts = typeof globalThis.echarts !== 'undefined';
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
                    </tr>
                </thead>
                <tbody>${results.map(result => renderMetricsRow(result, lang)).join('')}</tbody>
            </table>
        </div>
        <section class="result-block">
            <h3>${escapeHtml(t(lang, 'chartNavTitle'))}</h3>
            ${hasECharts
                ? '<div class="chart" id="navChart" role="img"></div>'
                : `<p class="message notice">${escapeHtml(t(lang, 'chartUnavailable'))}</p>`}
        </section>
        <section class="result-block">
            <h3>${escapeHtml(t(lang, 'assetsTitle'))}</h3>
            ${results.map(result => renderAssetsTable(result, lang)).join('')}
        </section>`;

    if (hasECharts) {
        renderNavChart(container.querySelector('#navChart'), results, lang);
    } else {
        disposeChart();
    }
}

function renderMetricsRow(result, lang) {
    const { metrics, run } = result;
    const finalValue = run.values[run.values.length - 1];
    return `
        <tr>
            <th scope="row">
                <span class="series-dot" style="background: var(${result.colorVar})"></span>${escapeHtml(result.name)}
                <span class="row-sub">${escapeHtml(result.rebalanceLabel)}${run.rebalanceDates.length ? ` · ${escapeHtml(t(lang, 'rebalanceCount', { count: run.rebalanceDates.length }))}` : ''}</span>
            </th>
            <td class="nowrap">${escapeHtml(metrics.startDate)} → ${escapeHtml(metrics.endDate)}</td>
            <td class="num">${escapeHtml(formatMoney(finalValue, lang))}</td>
            <td class="num ${trendClass(metrics.totalReturn)}">${formatPercent(metrics.totalReturn)}</td>
            <td class="num ${trendClass(metrics.cagr)}">${formatPercent(metrics.cagr)}</td>
            <td class="num down" title="${escapeHtml(t(lang, 'drawdownRange', { from: metrics.maxDrawdownPeak, to: metrics.maxDrawdownTrough }))}">${formatPercent(metrics.maxDrawdown, { signed: false })}</td>
            <td class="num">${formatPercent(metrics.volatility, { signed: false })}</td>
            <td class="num">${formatRatio(metrics.sharpe)}</td>
            <td class="num">${formatRatio(metrics.calmar)}</td>
        </tr>`;
}

function renderAssetsTable(result, lang) {
    const { run } = result;
    return `
        <div class="table-scroll asset-detail">
            <table class="data-table">
                <caption><span class="series-dot" style="background: var(${result.colorVar})"></span>${escapeHtml(result.name)}</caption>
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
        </div>`;
}

function renderNavChart(el, results, lang) {
    if (!el) return;
    disposeChart();
    const echarts = globalThis.echarts;
    navChart = echarts.init(el, null, { renderer: 'canvas', locale: lang === 'en' ? 'EN' : 'ZH' });

    const css = getComputedStyle(document.documentElement);
    const color = name => css.getPropertyValue(name).trim();
    const textColor = color('--muted-text');
    const borderColor = color('--border-color');

    navChart.setOption({
        animation: false,
        color: results.map(result => color(result.colorVar)),
        grid: { left: 8, right: 16, top: 36, bottom: 64, containLabel: true },
        legend: { top: 0, textStyle: { color: color('--text-color') } },
        tooltip: {
            trigger: 'axis',
            backgroundColor: color('--surface-color'),
            borderColor,
            textStyle: { color: color('--text-color') },
            valueFormatter: value => (Number.isFinite(value) ? `${value > 0 ? '+' : ''}${value.toFixed(2)}%` : '--')
        },
        xAxis: {
            type: 'time',
            axisLine: { lineStyle: { color: borderColor } },
            axisLabel: { color: textColor, hideOverlap: true }
        },
        yAxis: {
            type: 'value',
            scale: true,
            axisLabel: { color: textColor, formatter: value => `${value}%` },
            splitLine: { lineStyle: { color: borderColor, opacity: 0.6 } }
        },
        dataZoom: [
            { type: 'inside', filterMode: 'none' },
            { type: 'slider', height: 22, bottom: 10, filterMode: 'none', borderColor, textStyle: { color: textColor } }
        ],
        series: results.map(result => ({
            name: result.name,
            type: 'line',
            showSymbol: false,
            sampling: 'lttb',
            lineStyle: { width: 2 },
            data: result.run.dates.map((date, i) => [date, Number(((result.run.nav[i] - 1) * 100).toFixed(4))])
        }))
    });

    if (!resizeBound) {
        resizeBound = true;
        window.addEventListener('resize', () => navChart?.resize());
    }
}

function disposeChart() {
    if (navChart) {
        navChart.dispose();
        navChart = null;
    }
}
