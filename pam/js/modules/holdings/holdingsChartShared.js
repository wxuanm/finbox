import { state } from '../../config/state.js';
import { t } from '../../config/i18n.js';
import { escapeHtml, formatCurrency, formatPercent, formatWeight } from '../../utils/formatter.js';
import { getAssetClassLabel, getMarketLabel, getPriceStatusParts, isStalePrice } from './holdingsMetrics.js';

// Holdings detail shows one chart view at a time, so all chart views share one ECharts instance.
let chartInstance = null;
// Selecting a holding in any chart opens it for editing, so a spotted problem can be fixed directly.
let holdingClickHandler = null;
// Views pick a phone or desktop layout at render time, so crossing the breakpoint needs a re-render.
let layoutRerender = null;
let renderedStacked = null;
// Horizontal bar charts grow with the holding count so every name keeps a readable row.
const BAR_ROW_HEIGHT = 34;
// On phones the name sits on its own line above the bar, so each row is taller.
const STACKED_BAR_ROW_HEIGHT = 44;
const BAR_CHART_PADDING = 24;
const MIN_BAR_CHART_HEIGHT = 120;
// Below this chart width names move above their bars instead of sharing the row.
const STACKED_LABEL_MAX_WIDTH = 480;

export function getHoldingChartContainer() {
    return document.getElementById('holdingChartView');
}

export function setHoldingChartClickHandler(handler) {
    holdingClickHandler = handler;
    // Touch tooltips carry an edit button because a tap must first reveal details, not open the editor.
    getHoldingChartContainer()?.addEventListener('click', event => {
        const button = event.target.closest('[data-holding-chart-edit]');
        if (button) holdingClickHandler?.(button.dataset.holdingChartEdit);
    });
}

// Touch has no hover, so a tap shows the tooltip and editing moves to a button inside it.
export function isTouchChart() {
    return window.matchMedia?.('(hover: none)').matches ?? false;
}

// Shared tooltip behavior; touch tooltips stay open and accept taps so their edit button works.
export function holdingTooltipOption(formatter) {
    const touch = isTouchChart();
    return {
        trigger: 'item',
        confine: true,
        enterable: touch,
        triggerOn: touch ? 'click' : 'mousemove|click',
        formatter
    };
}

// getRow maps a clicked bar or axis label to its holding row; anything else is ignored.
export function initHoldingChart(el, getRow) {
    disposeHoldingChart();
    chartInstance = window.echarts.init(el);
    if (!isTouchChart()) {
        chartInstance.on('click', params => {
            const row = getRow(params);
            if (row?.id) holdingClickHandler?.(row.id);
        });
    }
    return chartInstance;
}

export function disposeHoldingChart() {
    if (chartInstance) chartInstance.dispose();
    chartInstance = null;
}

export function resizeHoldingChart() {
    const container = getHoldingChartContainer();
    const stacked = container ? isStackedBarLayout(container) : null;
    if (layoutRerender && stacked !== renderedStacked) {
        renderedStacked = stacked;
        layoutRerender();
        return;
    }
    if (chartInstance) chartInstance.resize();
}

export function trackHoldingChartLayout(rerender) {
    const container = getHoldingChartContainer();
    layoutRerender = rerender;
    renderedStacked = rerender && container ? isStackedBarLayout(container) : null;
}

export function renderChartNotice(el, message) {
    disposeHoldingChart();
    el.innerHTML = `<div class="empty-state">${message}</div>`;
}

export function hasECharts() {
    return typeof window.echarts !== 'undefined';
}

export function getCssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export function getChartColors() {
    return {
        positive: getCssVar('--positive-color') || '#ef4444',
        negative: getCssVar('--negative-color') || '#059669',
        neutral: getCssVar('--border-strong') || '#cbd5e1',
        text: getCssVar('--text-color') || '#0f172a',
        muted: getCssVar('--muted-text') || '#64748b',
        border: getCssVar('--border-color') || '#e5e7eb',
        surface: getCssVar('--surface-color') || '#ffffff',
        elevated: getCssVar('--surface-elevated') || '#ffffff',
        warning: getCssVar('--warning-color') || '#d97706',
        primary: getCssVar('--primary-color') || '#4f46e5'
    };
}


export function withAlpha(color, alpha) {
    const hex = color.replace('#', '');
    if (!/^[0-9a-f]{3}([0-9a-f]{3})?$/i.test(hex)) return color;
    const full = hex.length === 3 ? hex.split('').map(char => char + char).join('') : hex;
    const [r, g, b] = [0, 2, 4].map(index => parseInt(full.slice(index, index + 2), 16));
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function formatHoldingTooltip(row, extraLines = []) {
    const action = isTouchChart()
        ? renderHoldingEditButton(row)
        : `<small>${t('holdingChartClickToEdit')}</small>`;
    return [...holdingDetailLines(row, extraLines), action].join('<br>');
}

export function renderHoldingEditButton(row) {
    return `<button type="button" class="holding-tooltip-edit" data-holding-chart-edit="${escapeHtml(row.id)}">${t('edit')}</button>`;
}

// Detail lines shared by chart tooltips and the phone list's expanded rows.
export function holdingDetailLines(row, extraLines = []) {
    const lines = [
        `<strong>${escapeHtml(row.name)}</strong>${row.symbol ? ` <small>${escapeHtml(row.symbol)}</small>` : ''}`,
        `${t('marketValue')}: ${formatCurrency(row.marketValue, state.amountsHidden)}`,
        `${t('weight')}: ${formatWeight(row.weight)}`
    ];
    if (row.assetClass !== 'cash') {
        lines.push(`${t('holdingPnl')}: ${formatCurrency(row.unrealizedPnl, state.amountsHidden)} / ${formatPercent(row.unrealizedPnlPct)}`);
    }
    const priceStatus = getPriceStatusParts(row);
    const statusText = `${t('priceTime')}: ${priceStatus.label} · ${priceStatus.date}`;
    lines.push(isStalePrice(row) ? `<span style="color:${getChartColors().warning}">⚠ ${statusText}</span>` : statusText);
    return [...lines, ...extraLines];
}

export function isStackedBarLayout(el) {
    return (el.clientWidth || 0) < STACKED_LABEL_MAX_WIDTH;
}

export function barChartHeight(count, stacked = false) {
    return Math.max(MIN_BAR_CHART_HEIGHT, count * (stacked ? STACKED_BAR_ROW_HEIGHT : BAR_ROW_HEIGHT) + BAR_CHART_PADDING);
}

// Side labels size to the longest name, capped so bars keep most of the width.
export function barNameLabelWidth(el, names) {
    const longest = Math.max(...names.map(name => measureLabel(name)), 0);
    // Measure the canvas itself: on wide screens it shares the row with the stats column.
    const box = el.querySelector?.('.holding-chart-canvas') || el;
    return Math.min(Math.ceil(longest) + 4, Math.max(120, (box.clientWidth || 0) * 0.32));
}

let measureContext = null;
function measureLabel(text) {
    measureContext ||= document.createElement('canvas').getContext('2d');
    if (!measureContext) return String(text).length * 12;
    measureContext.font = '700 12px sans-serif';
    return measureContext.measureText(String(text)).width;
}

// Category axis labels for horizontal bar charts. Stacked: drawn inside the plot and lifted above
// each bar so names get the full width; side-by-side: sized to the longest name.
export function barCategoryAxisLabel(el, names, colors) {
    const base = { color: colors.text, fontSize: 12, fontWeight: 700, overflow: 'truncate' };
    if (!isStackedBarLayout(el)) return { ...base, width: barNameLabelWidth(el, names) };
    return {
        ...base,
        inside: true,
        margin: 0,
        align: 'left',
        verticalAlign: 'bottom',
        padding: [0, 0, 9, 0],
        width: Math.max((el.clientWidth || 0) - 24, 120)
    };
}

export function barThickness(el) {
    return isStackedBarLayout(el) ? 12 : 14;
}

// Stale prices make P/L unreliable, so charts prefix those holdings' names with a warning mark.
export function chartHoldingName(row) {
    return isStalePrice(row) ? `⚠ ${row.name}` : row.name;
}

export function countStaleRows(rows) {
    return rows.filter(row => Number(row.marketValue) > 0 && isStalePrice(row)).length;
}

// Cash has no P/L, so P/L-focused charts leave it out and mention its weight instead.
export function splitCashRows(rows) {
    const positiveRows = rows.filter(row => Number(row.marketValue) > 0);
    return {
        investedRows: positiveRows.filter(row => row.assetClass !== 'cash'),
        cashWeight: positiveRows
            .filter(row => row.assetClass === 'cash')
            .reduce((sum, row) => sum + (Number(row.weight) || 0), 0)
    };
}

// Weights are relative to the filtered rows, so say so whenever a filter narrows the portfolio.
export function getFilterScopeNote() {
    const { assetClass, market } = state.holdingFilters;
    const labels = [
        assetClass !== 'all' ? getAssetClassLabel(assetClass) : '',
        market !== 'all' ? getMarketLabel(market) : ''
    ].filter(Boolean);
    return labels.length > 0 ? t('holdingChartFilterScope', { filters: labels.map(escapeHtml).join(' · ') }) : '';
}

export function renderChartFootnote(text) {
    return text ? `<p class="holding-chart-footnote">${text}</p>` : '';
}

// Bar charts stop at a readable width, so wide screens put the stats in a column beside the chart
// instead of leaving the rest of the row empty. Narrower screens stack the stats above the chart;
// `wideOnly` drops them there instead.
export function renderChartLayout(main, side, { wideOnly = false } = {}) {
    const aside = side ? `<aside class="holding-chart-side${wideOnly ? ' wide-only' : ''}">${side}</aside>` : '';
    return `<div class="holding-chart-layout">${aside}<div class="holding-chart-main">${main}</div></div>`;
}

// stats: [label, value, detail, valueClass] tuples; empty entries are skipped.
export function renderChartStats(stats) {
    return `
        <dl class="holding-chart-stats">${stats.filter(Boolean).map(([label, value, detail, valueClass]) => `
            <div>
                <dt>${label}</dt>
                <dd><strong${valueClass ? ` class="${valueClass}"` : ''}>${value}</strong>${detail ? `<small title="${escapeHtml(detail)}">${escapeHtml(detail)}</small>` : ''}</dd>
            </div>
        `).join('')}</dl>
    `;
}
