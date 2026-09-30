import { state } from '../../config/state.js';
import { t } from '../../config/i18n.js';
import { escapeHtml, formatCurrency, formatPercent, formatWeight, signedClass } from '../../utils/formatter.js';
import { ASSET_CLASSES, getAssetClassLabel } from './holdingsMetrics.js';

let treemapInstance = null;
// P/L percentage at which tile color reaches full intensity.
const PNL_COLOR_SATURATION_PCT = 20;
// Tiny positions get a floor tile share so they stay visible and hoverable; labels still show real weight.
const MIN_TILE_SHARE = 0.015;
// Holdings below this weight rarely fit a tile label, so they are also listed under the chart.
const MINOR_HOLDING_WEIGHT = 3;

export function renderHoldingTreemap(rows) {
    const el = document.getElementById('holdingTreemap');
    if (!el) return;
    disposeTreemap();

    if (typeof window.echarts === 'undefined') {
        el.innerHTML = `<div class="empty-state">${t('chartLibraryFailed')}</div>`;
        return;
    }

    const data = buildTreemapData(rows);
    if (data.length === 0) {
        el.innerHTML = `<div class="empty-state">${t('holdingTreemapEmpty')}</div>`;
        return;
    }

    const minorRows = rows
        .filter(row => Number(row.marketValue) > 0 && Number(row.weight) < MINOR_HOLDING_WEIGHT)
        .sort((a, b) => b.marketValue - a.marketValue);
    el.innerHTML = `
        <div class="holding-treemap-chart"></div>
        ${minorRows.length > 0 ? renderMinorHoldings(minorRows) : ''}
    `;
    treemapInstance = window.echarts.init(el.querySelector('.holding-treemap-chart'));
    const textColor = getCssVar('--text-color') || '#0f172a';
    const borderColor = getCssVar('--surface-color') || '#ffffff';
    treemapInstance.setOption({
        tooltip: { formatter: formatTreemapTooltip },
        series: [{
            type: 'treemap',
            data,
            left: 0,
            right: 0,
            top: 0,
            bottom: 0,
            roam: false,
            visibleMin: 1,
            nodeClick: false,
            breadcrumb: { show: false },
            label: {
                show: true,
                color: textColor,
                fontSize: 12,
                lineHeight: 16,
                overflow: 'truncate',
                formatter: formatTreemapLabel
            },
            upperLabel: {
                show: true,
                height: 22,
                color: getCssVar('--muted-text') || '#64748b',
                fontSize: 11,
                fontWeight: 800
            },
            levels: [
                { itemStyle: { borderWidth: 0, gapWidth: 4 } },
                {
                    itemStyle: { borderColor: getCssVar('--surface-elevated') || borderColor, borderWidth: 3, gapWidth: 2 },
                    emphasis: { upperLabel: { color: textColor } }
                },
                { itemStyle: { borderColor, borderWidth: 1, gapWidth: 1 } }
            ]
        }]
    });
}

export function resizeHoldingTreemap() {
    if (treemapInstance) treemapInstance.resize();
}

export function disposeTreemap() {
    if (treemapInstance) treemapInstance.dispose();
    treemapInstance = null;
}

function buildTreemapData(rows) {
    const positiveColor = getCssVar('--positive-color') || '#ef4444';
    const negativeColor = getCssVar('--negative-color') || '#059669';
    const neutralColor = getCssVar('--border-strong') || '#cbd5e1';
    const totalMarketValue = rows.reduce((sum, row) => sum + Math.max(Number(row.marketValue) || 0, 0), 0);
    const minTileValue = totalMarketValue * MIN_TILE_SHARE;
    return ASSET_CLASSES
        .map(([assetClass]) => {
            const children = rows
                .filter(row => row.assetClass === assetClass && Number(row.marketValue) > 0)
                .sort((a, b) => b.marketValue - a.marketValue)
                .map(row => ({
                    name: row.name,
                    value: Math.max(row.marketValue, minTileValue),
                    row,
                    itemStyle: { color: pnlColor(row, positiveColor, negativeColor, neutralColor) }
                }));
            if (children.length === 0) return null;
            return {
                name: getAssetClassLabel(assetClass),
                value: children.reduce((sum, child) => sum + child.value, 0),
                marketValue: children.reduce((sum, child) => sum + child.row.marketValue, 0),
                children
            };
        })
        .filter(Boolean);
}

function renderMinorHoldings(rows) {
    const positiveColor = getCssVar('--positive-color') || '#ef4444';
    const negativeColor = getCssVar('--negative-color') || '#059669';
    const neutralColor = getCssVar('--border-strong') || '#cbd5e1';
    return `
        <div class="holding-treemap-minor">
            <span class="holding-treemap-minor-title">${t('holdingTreemapMinor', { weight: MINOR_HOLDING_WEIGHT })}</span>
            <ul>${rows.map(row => `
                <li title="${escapeHtml(row.name)}">
                    <i style="background:${pnlColor(row, positiveColor, negativeColor, neutralColor)}"></i>
                    <span>${escapeHtml(row.name)}</span>
                    <strong>${formatWeight(row.weight)}</strong>
                    ${row.assetClass === 'cash' ? '' : `<small class="${signedClass(row.unrealizedPnl)}">${formatPercent(row.unrealizedPnlPct)}</small>`}
                </li>
            `).join('')}</ul>
        </div>
    `;
}

function pnlColor(row, positiveColor, negativeColor, neutralColor) {
    const pct = Number(row.unrealizedPnlPct);
    if (row.assetClass === 'cash' || !Number.isFinite(pct) || pct === 0) return withAlpha(neutralColor, 0.55);
    const intensity = Math.min(Math.abs(pct) / PNL_COLOR_SATURATION_PCT, 1);
    return withAlpha(pct > 0 ? positiveColor : negativeColor, 0.22 + intensity * 0.6);
}

function withAlpha(color, alpha) {
    const hex = color.replace('#', '');
    if (!/^[0-9a-f]{3}([0-9a-f]{3})?$/i.test(hex)) return color;
    const full = hex.length === 3 ? hex.split('').map(char => char + char).join('') : hex;
    const [r, g, b] = [0, 2, 4].map(index => parseInt(full.slice(index, index + 2), 16));
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function formatTreemapLabel(params) {
    const row = params.data?.row;
    if (!row) return params.name;
    const detail = row.assetClass === 'cash'
        ? formatWeight(row.weight)
        : `${formatWeight(row.weight)} · ${formatPercent(row.unrealizedPnlPct)}`;
    return `${params.name}\n${detail}`;
}

function formatTreemapTooltip(params) {
    const row = params.data?.row;
    if (!row) {
        return `<strong>${escapeHtml(params.name)}</strong><br>${t('marketValue')}: ${formatCurrency(params.data?.marketValue, state.amountsHidden)}`;
    }
    const lines = [
        `<strong>${escapeHtml(row.name)}</strong>${row.symbol ? ` <small>${escapeHtml(row.symbol)}</small>` : ''}`,
        `${t('marketValue')}: ${formatCurrency(row.marketValue, state.amountsHidden)}`,
        `${t('weight')}: ${formatWeight(row.weight)}`
    ];
    if (row.assetClass !== 'cash') {
        lines.push(`${t('cumulativePnl')}: ${formatCurrency(row.unrealizedPnl, state.amountsHidden)} / ${formatPercent(row.unrealizedPnlPct)}`);
    }
    return lines.join('<br>');
}

function getCssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
