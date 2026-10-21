import { state } from '../../config/state.js';
import { t } from '../../config/i18n.js';
import { escapeHtml, formatCurrency, formatPercent, formatWeight } from '../../utils/formatter.js';
import { getAssetClassLabel, getMarketLabel, getPriceStatusParts, isStalePrice } from './holdingsMetrics.js';

// Holdings detail shows one chart view at a time, so all chart views share one ECharts instance.
let chartInstance = null;
// Clicking a holding in any chart opens it for editing, so a spotted problem can be fixed directly.
let holdingClickHandler = null;
// P/L percentage at which tile color reaches full intensity.
export const PNL_COLOR_SATURATION_PCT = 20;
const PNL_ALPHA_MIN = 0.22;
const PNL_ALPHA_RANGE = 0.6;
const NEUTRAL_ALPHA = 0.55;

export function getHoldingChartContainer() {
    return document.getElementById('holdingChartView');
}

export function setHoldingChartClickHandler(handler) {
    holdingClickHandler = handler;
    // Chip lists rendered next to a chart are plain HTML, so they share one delegated listener.
    getHoldingChartContainer()?.addEventListener('click', event => {
        const chip = event.target.closest('[data-holding-chart-id]');
        if (chip) holdingClickHandler?.(chip.dataset.holdingChartId);
    });
}

// getRow maps a clicked ECharts item to its holding row; group tiles return nothing and are ignored.
export function initHoldingChart(el, getRow = params => params.data?.row) {
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
        warning: getCssVar('--warning-color') || '#d97706'
    };
}

export function pnlColor(row, colors = getChartColors()) {
    const pct = Number(row.unrealizedPnlPct);
    if (row.assetClass === 'cash' || !Number.isFinite(pct) || pct === 0) return withAlpha(colors.neutral, NEUTRAL_ALPHA);
    const intensity = Math.min(Math.abs(pct) / PNL_COLOR_SATURATION_PCT, 1);
    return withAlpha(pct > 0 ? colors.positive : colors.negative, PNL_ALPHA_MIN + intensity * PNL_ALPHA_RANGE);
}

// Same scale as pnlColor, from full loss to full gain, for the color legend.
export function pnlScaleGradient(colors = getChartColors()) {
    const full = PNL_ALPHA_MIN + PNL_ALPHA_RANGE;
    return `linear-gradient(90deg, ${[
        withAlpha(colors.negative, full),
        withAlpha(colors.negative, PNL_ALPHA_MIN),
        withAlpha(colors.neutral, NEUTRAL_ALPHA),
        withAlpha(colors.positive, PNL_ALPHA_MIN),
        withAlpha(colors.positive, full)
    ].join(', ')})`;
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
