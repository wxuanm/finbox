import { state, PERIODS } from '../../config/state.js';
import { periodLabel, t } from '../../config/i18n.js';
import { escapeHtml, formatChartAxisPercent, formatCurrency, formatNumber, formatPercent, signedClass } from '../../utils/formatter.js';
import { withAlpha } from '../holdings/holdingsChartShared.js';
import { getPeriodStartDate } from './metrics.js';
import { LIST_HALF_START_CLASS, clampPage, getListColumnCount, getPageCount, keepFirstRowPage, pairRows, renderPager } from './pager.js';

// Mirrors the single-fund trend view in the VSIX: the same period drives a return curve or a paged NAV list.
export const ACCOUNT_TREND_VIEWS = [
    ['chart', 'accountTrendViewChart'],
    ['list', 'accountTrendViewList']
];

// Rows per column; a desktop page pairs two columns in one table, like the VSIX NAV list.
const LIST_COLUMN_SIZE = 10;
const CHART_MAX_VISIBLE_SYMBOLS = 24;
const CHART_Y_AXIS_TARGET_SPLITS = 4;
const CHART_NARROW_WIDTH = 520;
const CHART_GRID_LEFT = 16;
const CHART_GRID_RIGHT = 64;
const CHART_MARKER_COLLISION_PX = 72;

let chartInstance = null;
let currentPage = 1;
// Paging restarts whenever the account or period behind the list changes.
let pageKey = '';
// Columns rendered by the last list render, so crossing the phone breakpoint can re-page the list.
let renderedColumnCount = 0;
let listRerender = null;

export function renderAccountTrend(metrics) {
    const panel = document.getElementById('accountTrendPanel');
    if (!panel) return;

    const metric = metrics.find(item => item.account.id === state.selectedAccountId);
    const badge = document.getElementById('accountTrendBadge');
    if (badge) {
        badge.textContent = metric?.account.name || '';
        badge.hidden = !metric;
    }

    renderPeriodChips();
    const ready = Boolean(metric?.valid);
    renderViewSwitch(ready);

    const chartEl = document.getElementById('accountTrendChart');
    const listEl = document.getElementById('accountTrendList');
    const messageEl = document.getElementById('accountTrendMessage');
    if (!chartEl || !listEl || !messageEl) return;

    renderedColumnCount = 0;
    listRerender = null;
    if (!ready) {
        disposeChart();
        chartEl.hidden = true;
        listEl.hidden = true;
        messageEl.classList.remove('error');
        messageEl.textContent = metric ? metric.error : t('noAccounts');
        messageEl.hidden = false;
        return;
    }

    const rows = buildTrendRows(metric);
    if (state.accountTrendView === 'list') {
        disposeChart();
        chartEl.hidden = true;
        messageEl.hidden = true;
        listEl.hidden = false;
        renderList(listEl, metric, rows);
        return;
    }

    listEl.hidden = true;
    renderChart(chartEl, messageEl, metric, rows);
}

export function bindAccountTrend({ onPeriodChange, onViewChange, onPageChange }) {
    document.getElementById('accountTrendPeriodSwitch')?.addEventListener('click', event => {
        const chip = event.target.closest('[data-period]');
        if (chip) onPeriodChange(chip.dataset.period);
    });
    document.getElementById('accountTrendViewSwitch')?.addEventListener('click', event => {
        const chip = event.target.closest('[data-account-trend-view]');
        if (chip) onViewChange(chip.dataset.accountTrendView);
    });
    document.getElementById('accountTrendList')?.addEventListener('click', event => {
        const button = event.target.closest('[data-page]');
        if (!button || button.disabled) return;
        currentPage = Number(button.dataset.page) || 1;
        onPageChange();
    });
}

export function resizeAccountTrendChart() {
    if (renderedColumnCount && getListColumnCount() !== renderedColumnCount) {
        currentPage = keepFirstRowPage(currentPage, renderedColumnCount, getListColumnCount());
        listRerender?.();
    }
    if (!chartInstance || chartInstance.isDisposed()) return;
    chartInstance.resize();
}

function renderPeriodChips() {
    const wrap = document.getElementById('accountTrendPeriodSwitch');
    if (!wrap) return;
    wrap.innerHTML = PERIODS.map(([key]) => {
        const active = state.selectedPeriod === key;
        return `<button class="period-chip${active ? ' active' : ''}" type="button" data-period="${key}" aria-pressed="${active}">${periodLabel(key)}</button>`;
    }).join('');
}

function renderViewSwitch(ready) {
    const wrap = document.getElementById('accountTrendViewSwitch');
    if (!wrap) return;
    wrap.classList.toggle('hidden', !ready);
    wrap.innerHTML = ACCOUNT_TREND_VIEWS.map(([key, label]) => {
        const active = state.accountTrendView === key;
        return `<button class="period-chip${active ? ' active' : ''}" type="button" data-account-trend-view="${key}" aria-pressed="${active}">${t(label)}</button>`;
    }).join('');
}

// periodPoints is the tail of points (the period anchor plus every snapshot inside the period), so period
// return uses the same anchor as the metrics and change compares each snapshot with the one before it.
function buildTrendRows(metric) {
    const { points, periodPoints } = metric;
    const anchor = periodPoints[0];
    const offset = points.length - periodPoints.length;
    const startDate = getPeriodStartDate(metric.latestDate, state.selectedPeriod);
    return periodPoints.map((point, index) => {
        const previous = points[offset + index - 1];
        return {
            ...point,
            periodReturn: (point.unitNav / anchor.unitNav - 1) * 100,
            change: previous ? (point.unitNav / previous.unitNav - 1) * 100 : null,
            // A snapshot before the period start only sets the baseline, like the YTD base in the fund list.
            isAnchor: Boolean(startDate) && point.date < startDate
        };
    });
}

function renderChart(chartEl, messageEl, metric, rows) {
    if (typeof window.echarts === 'undefined') {
        disposeChart();
        chartEl.hidden = true;
        messageEl.textContent = t('chartLibraryFailed');
        messageEl.classList.add('error');
        messageEl.hidden = false;
        return;
    }

    messageEl.hidden = true;
    messageEl.classList.remove('error');
    chartEl.hidden = false;
    // The asset view is hidden while another workspace view is active; wait until it can be measured.
    if (chartEl.clientWidth === 0) {
        disposeChart();
        return;
    }
    if (!chartInstance || chartInstance.isDisposed() || chartInstance.getDom() !== chartEl) {
        disposeChart();
        chartInstance = window.echarts.init(chartEl);
    }
    chartInstance.setOption(buildChartOption(metric, rows), { replaceMerge: ['series'] });
}

function buildChartOption(metric, rows) {
    const theme = getChartTheme();
    const coarsePointer = window.matchMedia?.('(pointer: coarse)')?.matches === true;
    const data = rows.map(row => ({
        value: [row.date, row.periodReturn],
        row
    }));
    const values = rows.map(row => row.periodReturn).filter(Number.isFinite);
    const latest = rows[rows.length - 1];
    const narrow = (chartInstance?.getWidth() || 800) < CHART_NARROW_WIDTH;

    return {
        aria: {
            enabled: true,
            label: {
                description: t('accountTrendAria', {
                    account: metric.account.name,
                    start: rows[0]?.date || '',
                    end: latest?.date || '',
                    value: formatPercent(latest?.periodReturn)
                })
            }
        },
        tooltip: {
            trigger: 'axis',
            triggerOn: coarsePointer ? 'click' : 'mousemove|click',
            confine: true,
            backgroundColor: theme.elevated,
            borderColor: theme.border,
            textStyle: { color: theme.text },
            extraCssText: 'box-shadow: 0 10px 28px -16px rgb(15 23 42 / 0.45);',
            axisPointer: { type: 'line', lineStyle: { color: theme.borderStrong, type: 'dashed' } },
            formatter: formatTooltip
        },
        grid: { top: 28, right: CHART_GRID_RIGHT, bottom: 32, left: CHART_GRID_LEFT },
        xAxis: {
            type: 'time',
            boundaryGap: false,
            splitNumber: narrow ? 4 : 8,
            axisLine: { lineStyle: { color: theme.border } },
            axisTick: { lineStyle: { color: theme.border } },
            axisLabel: { color: theme.muted, hideOverlap: true },
            splitLine: { show: false }
        },
        yAxis: {
            type: 'value',
            position: 'right',
            ...calculateYAxisBounds(values),
            axisLabel: {
                color: theme.muted,
                formatter: value => Math.abs(Number(value)) < 1e-9
                    ? `{zero|${formatChartAxisPercent(value)}}`
                    : formatChartAxisPercent(value),
                rich: { zero: { color: theme.text, fontWeight: 800 } }
            },
            splitLine: { lineStyle: { color: theme.border } }
        },
        series: [{
            id: 'account-trend',
            name: metric.account.name,
            type: 'line',
            smooth: false,
            showSymbol: rows.length <= CHART_MAX_VISIBLE_SYMBOLS,
            symbol: 'circle',
            symbolSize: 5,
            lineStyle: { width: 2.4, color: theme.line },
            itemStyle: { color: theme.line, borderColor: theme.surface, borderWidth: 1 },
            areaStyle: {
                color: {
                    type: 'linear',
                    x: 0,
                    y: 0,
                    x2: 0,
                    y2: 1,
                    colorStops: [
                        { offset: 0, color: withAlpha(theme.line, 0.18) },
                        { offset: 1, color: withAlpha(theme.line, 0.01) }
                    ]
                }
            },
            markPoint: {
                symbol: 'circle',
                symbolSize: 8,
                itemStyle: { color: theme.line, borderColor: theme.surface, borderWidth: 2 },
                label: {
                    formatter: params => formatPercent(Number(params.value)),
                    color: theme.text,
                    fontSize: 11,
                    fontWeight: 700,
                    textBorderColor: theme.surface,
                    textBorderWidth: 3
                },
                data: buildMarkPoints(rows, theme)
            },
            data
        }]
    };
}

// High and low are dropped when they coincide with the latest value, sit on the 0% anchor the axis already
// labels, or are close enough to the latest point that the labels would overlap.
function buildMarkPoints(rows, theme) {
    const points = rows.filter(row => Number.isFinite(row.periodReturn));
    if (points.length < 2) return [];
    const latest = points[points.length - 1];
    const high = points.reduce((best, row) => (row.periodReturn > best.periodReturn ? row : best), points[0]);
    const low = points.reduce((best, row) => (row.periodReturn < best.periodReturn ? row : best), points[0]);
    const firstTime = parseDate(points[0].date);
    const span = parseDate(latest.date) - firstTime;
    const plotWidth = Math.max(200, (chartInstance?.getWidth() || 800) - CHART_GRID_LEFT - CHART_GRID_RIGHT);
    const pxFromLatest = row => (span > 0 ? (parseDate(latest.date) - parseDate(row.date)) / span * plotWidth : 0);
    const isLabelled = row => row.periodReturn !== latest.periodReturn
        && Math.abs(row.periodReturn) >= 0.005
        && pxFromLatest(row) >= CHART_MARKER_COLLISION_PX;
    const marks = [];
    if (isLabelled(low)) {
        marks.push({ name: 'Low', coord: [low.date, low.periodReturn], value: low.periodReturn, label: { position: 'bottom' } });
    }
    if (isLabelled(high)) {
        marks.push({ name: 'High', coord: [high.date, high.periodReturn], value: high.periodReturn, label: { position: 'top' } });
    }
    marks.push({
        name: 'Latest',
        coord: [latest.date, latest.periodReturn],
        value: latest.periodReturn,
        // The latest point sits on the right edge next to the y-axis labels, so its label opens to the left.
        label: {
            position: 'left',
            distance: 8,
            backgroundColor: withAlpha(theme.surface, 0.86),
            padding: [2, 5],
            borderRadius: 3,
            color: latest.periodReturn > 0 ? theme.positive : latest.periodReturn < 0 ? theme.negative : theme.text
        }
    });
    return marks;
}

function formatTooltip(params) {
    const item = (Array.isArray(params) ? params : [params]).find(entry => entry.data?.row);
    const row = item?.data?.row;
    if (!row) return '';
    const line = (label, value, className = '') => `
        <div style="display:flex;justify-content:space-between;gap:16px;line-height:1.5;">
            <span style="opacity:0.72;">${escapeHtml(label)}</span>
            <strong class="${className}" style="font-variant-numeric:tabular-nums;">${value}</strong>
        </div>
    `;
    return `
        <div style="min-width:180px;">
            <div style="font-weight:700;margin-bottom:4px;">${escapeHtml(row.date)}</div>
            ${line(t('periodReturn'), formatPercent(row.periodReturn), signedClass(row.periodReturn))}
            ${line(t('unitNav'), formatNumber(row.unitNav, 4))}
            ${line(t('snapshotChange'), formatPercent(row.change), signedClass(row.change))}
            ${line(t('totalAssets'), formatCurrency(row.totalValue, state.amountsHidden))}
        </div>
    `;
}

function renderList(listEl, metric, rows) {
    // The pre-period anchor is a baseline, not a snapshot inside the period, so the list leaves it out.
    const listRows = rows.filter(row => !row.isAnchor).reverse();
    const key = `${metric.account.id}|${state.selectedPeriod}`;
    if (key !== pageKey) {
        pageKey = key;
        currentPage = 1;
    }
    if (listRows.length === 0) {
        listEl.innerHTML = `<div class="empty-state">${escapeHtml(t('accountTrendEmptyPeriod'))}</div>`;
        return;
    }

    const columnCount = getListColumnCount();
    const pageSize = LIST_COLUMN_SIZE * columnCount;
    const pageCount = getPageCount(listRows.length, pageSize);
    currentPage = clampPage(currentPage, pageCount);
    const pageRows = listRows.slice((currentPage - 1) * pageSize, currentPage * pageSize);
    renderedColumnCount = columnCount;
    listRerender = () => renderList(listEl, metric, rows);

    listEl.innerHTML = `
        <div class="account-trend-table-wrap">
            <table class="account-trend-table">
                <thead>
                    <tr>${renderListHeader(false)}${columnCount > 1 ? renderListHeader(true) : ''}</tr>
                </thead>
                <tbody>
                    ${pairRows(pageRows, columnCount).map(([left, right]) => `
                        <tr>
                            ${renderListCells(left, false)}
                            ${columnCount > 1 ? (right ? renderListCells(right, true) : `<td class="${LIST_HALF_START_CLASS}" colspan="4"></td>`) : ''}
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
        ${pageCount > 1 ? renderPager(currentPage, pageCount, listRows.length) : ''}
    `;
}

function renderListHeader(halfStart) {
    return `
        <th${halfStart ? ` class="${LIST_HALF_START_CLASS}"` : ''}>${t('date')}</th>
        <th class="number-cell">${t('unitNav')}</th>
        <th class="number-cell">${t('cumulativeReturn')}</th>
        <th class="number-cell" title="${escapeHtml(t('snapshotChangeHint'))}">${t('snapshotChange')}</th>
    `;
}

function renderListCells(row, halfStart) {
    return `
        <td${halfStart ? ` class="${LIST_HALF_START_CLASS}"` : ''}>${escapeHtml(row.date)}</td>
        <td class="number-cell">${formatNumber(row.unitNav, 4)}</td>
        <td class="number-cell ${signedClass(row.returnPct)}">${formatPercent(row.returnPct)}</td>
        <td class="number-cell ${signedClass(row.change)}">${formatPercent(row.change)}</td>
    `;
}

function parseDate(date) {
    return new Date(`${date}T00:00:00`).getTime();
}

function disposeChart() {
    if (chartInstance && !chartInstance.isDisposed()) chartInstance.dispose();
    chartInstance = null;
}

function getCssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function getChartTheme() {
    return {
        text: getCssVar('--text-color') || '#2b3150',
        muted: getCssVar('--muted-text') || '#6a7190',
        border: getCssVar('--border-color') || '#dce2f3',
        borderStrong: getCssVar('--border-strong') || '#b6bfd8',
        surface: getCssVar('--surface-color') || '#ffffff',
        elevated: getCssVar('--surface-elevated') || '#ffffff',
        positive: getCssVar('--positive-color') || '#ef4444',
        negative: getCssVar('--negative-color') || '#059669',
        line: getCssVar('--chart-series-1') || '#2a78d6'
    };
}

// Same 1-2-5 tick snapping as the performance chart, always including the 0% break-even line.
function calculateYAxisBounds(values) {
    if (values.length === 0) return {};
    const all = [...values, 0];
    const min = Math.min(...all);
    const max = Math.max(...all);
    const span = max - min;
    const interval = getYAxisInterval(span / CHART_Y_AXIS_TARGET_SPLITS);
    const axisMin = span > 0 ? Math.floor(min / interval) * interval : min - interval;
    const axisMax = span > 0 ? Math.ceil(max / interval) * interval : max + interval;
    return {
        min: Number(axisMin.toPrecision(10)),
        max: Number((axisMax > axisMin ? axisMax : axisMin + interval).toPrecision(10)),
        interval
    };
}

function getYAxisInterval(rawInterval) {
    if (!Number.isFinite(rawInterval) || rawInterval <= 0.2) return 0.2;
    const magnitude = 10 ** Math.floor(Math.log10(rawInterval));
    const normalized = rawInterval / magnitude;
    const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
    return Number((step * magnitude).toPrecision(6));
}
