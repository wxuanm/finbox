import { state } from '../../config/state.js';
import { t } from '../../config/i18n.js';
import { escapeHtml, formatCurrency, formatPercent, formatWeight } from '../../utils/formatter.js';

// Holdings detail shows one chart view at a time, so all chart views share one ECharts instance.
let chartInstance = null;
// P/L percentage at which tile/bubble color reaches full intensity.
const PNL_COLOR_SATURATION_PCT = 20;

export function getHoldingChartContainer() {
    return document.getElementById('holdingChartView');
}

export function initHoldingChart(el) {
    disposeHoldingChart();
    chartInstance = window.echarts.init(el);
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
        elevated: getCssVar('--surface-elevated') || '#ffffff'
    };
}

export function pnlColor(row, colors = getChartColors()) {
    const pct = Number(row.unrealizedPnlPct);
    if (row.assetClass === 'cash' || !Number.isFinite(pct) || pct === 0) return withAlpha(colors.neutral, 0.55);
    const intensity = Math.min(Math.abs(pct) / PNL_COLOR_SATURATION_PCT, 1);
    return withAlpha(pct > 0 ? colors.positive : colors.negative, 0.22 + intensity * 0.6);
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
        lines.push(`${t('cumulativePnl')}: ${formatCurrency(row.unrealizedPnl, state.amountsHidden)} / ${formatPercent(row.unrealizedPnlPct)}`);
    }
    return [...lines, ...extraLines].join('<br>');
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

export function renderChartFootnote(text) {
    return text ? `<p class="holding-chart-footnote">${text}</p>` : '';
}
