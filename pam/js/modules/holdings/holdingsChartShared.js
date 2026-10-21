import { state } from '../../config/state.js';
import { t } from '../../config/i18n.js';
import { escapeHtml, formatCurrency, formatPercent, formatWeight } from '../../utils/formatter.js';
import { getAssetClassLabel, getMarketLabel, getPriceStatusParts, isStalePrice } from './holdingsMetrics.js';

// Holdings detail shows one chart view at a time, so all chart views share one ECharts instance.
let chartInstance = null;
// Clicking a holding in any chart opens it for editing, so a spotted problem can be fixed directly.
let holdingClickHandler = null;
// Horizontal bar charts grow with the holding count so every name keeps a readable row.
const BAR_ROW_HEIGHT = 34;
const BAR_CHART_PADDING = 56;
const MIN_BAR_CHART_HEIGHT = 220;

export function getHoldingChartContainer() {
    return document.getElementById('holdingChartView');
}

export function setHoldingChartClickHandler(handler) {
    holdingClickHandler = handler;
}

// getRow maps a clicked bar or axis label to its holding row; anything else is ignored.
export function initHoldingChart(el, getRow) {
    disposeHoldingChart();
    chartInstance = window.echarts.init(el);
    chartInstance.on('click', params => {
        const row = getRow(params);
        if (row?.id) holdingClickHandler?.(row.id);
    });
    return chartInstance;
}

export function disposeHoldingChart() {
    if (chartInstance) chartInstance.dispose();
    chartInstance = null;
}

export function resizeHoldingChart() {
    if (chartInstance) chartInstance.resize();
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
    return [...lines, ...extraLines, `<small>${t('holdingChartClickToEdit')}</small>`].join('<br>');
}

export function barChartHeight(count) {
    return Math.max(MIN_BAR_CHART_HEIGHT, count * BAR_ROW_HEIGHT + BAR_CHART_PADDING);
}

// Long names truncate sooner on phones so bars keep enough room.
export function barNameLabelWidth(el) {
    return (el.clientWidth || 0) < 480 ? 96 : 128;
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
