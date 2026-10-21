import { state } from '../../config/state.js';
import { t } from '../../config/i18n.js';
import { escapeHtml, formatCurrency, formatPercent, formatWeight, signedClass } from '../../utils/formatter.js';
import { ASSET_CLASSES, getAssetClassLabel, isStalePrice } from './holdingsMetrics.js';
import {
    PNL_COLOR_SATURATION_PCT,
    chartHoldingName,
    countStaleRows,
    formatHoldingTooltip,
    getChartColors,
    getFilterScopeNote,
    hasECharts,
    initHoldingChart,
    pnlColor,
    pnlScaleGradient,
    renderChartFootnote,
    renderChartNotice
} from './holdingsChartShared.js';

// Tiny positions get a floor tile share so they stay visible and hoverable; labels still show real weight.
const MIN_TILE_SHARE = 0.015;
// Holdings below this weight rarely fit a tile label, so they are also listed under the chart.
const MINOR_HOLDING_WEIGHT = 3;
// Long minor lists push the chart notes far down, so only the largest ones stay expanded.
const MINOR_VISIBLE_COUNT = 8;

export function renderHoldingTreemap(el, rows) {
    if (!hasECharts()) {
        renderChartNotice(el, t('chartLibraryFailed'));
        return;
    }

    const colors = getChartColors();
    const data = buildTreemapData(rows, colors);
    if (data.length === 0) {
        renderChartNotice(el, t('holdingTreemapEmpty'));
        return;
    }

    const minorRows = rows
        .filter(row => Number(row.marketValue) > 0 && Number(row.weight) < MINOR_HOLDING_WEIGHT)
        .sort((a, b) => b.marketValue - a.marketValue);
    const staleCount = countStaleRows(rows);
    el.innerHTML = `
        <div class="holding-chart-canvas"></div>
        ${renderPnlLegend(colors)}
        ${minorRows.length > 0 ? renderMinorHoldings(minorRows, colors) : ''}
        ${renderChartFootnote([
            t('holdingTreemapHint'),
            staleCount > 0 ? t('holdingChartStaleNote', { count: staleCount }) : '',
            getFilterScopeNote()
        ].filter(Boolean).join(' '))}
    `;
    const chart = initHoldingChart(el.querySelector('.holding-chart-canvas'));
    chart.setOption({
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
                color: colors.text,
                fontSize: 12,
                lineHeight: 16,
                overflow: 'truncate',
                formatter: formatTreemapLabel
            },
            upperLabel: {
                show: true,
                height: 22,
                color: colors.muted,
                fontSize: 11,
                fontWeight: 800,
                formatter: params => `${params.name}  ${formatWeight(params.data?.weight)}`
            },
            levels: [
                { itemStyle: { borderWidth: 0, gapWidth: 4 } },
                {
                    itemStyle: { borderColor: colors.elevated, borderWidth: 3, gapWidth: 2 },
                    emphasis: { upperLabel: { color: colors.text } }
                },
                { itemStyle: { borderColor: colors.surface, borderWidth: 1, gapWidth: 1 } }
            ]
        }]
    });
}

function buildTreemapData(rows, colors) {
    const totalMarketValue = rows.reduce((sum, row) => sum + Math.max(Number(row.marketValue) || 0, 0), 0);
    const minTileValue = totalMarketValue * MIN_TILE_SHARE;
    return ASSET_CLASSES
        .map(([assetClass]) => {
            const children = rows
                .filter(row => row.assetClass === assetClass && Number(row.marketValue) > 0)
                .sort((a, b) => b.marketValue - a.marketValue)
                .map(row => ({
                    name: chartHoldingName(row),
                    value: Math.max(row.marketValue, minTileValue),
                    row,
                    itemStyle: {
                        color: pnlColor(row, colors),
                        ...(isStalePrice(row) ? { borderColor: colors.warning, borderWidth: 2 } : {})
                    }
                }));
            if (children.length === 0) return null;
            return {
                name: getAssetClassLabel(assetClass),
                value: children.reduce((sum, child) => sum + child.value, 0),
                marketValue: children.reduce((sum, child) => sum + child.row.marketValue, 0),
                weight: children.reduce((sum, child) => sum + (Number(child.row.weight) || 0), 0),
                children
            };
        })
        .filter(Boolean);
}

function renderPnlLegend(colors) {
    return `
        <div class="holding-pnl-legend">
            <span>${t('holdingLegendLoss')} ${formatPercent(-PNL_COLOR_SATURATION_PCT, 0)}</span>
            <i style="background:${pnlScaleGradient(colors)}"></i>
            <span>${formatPercent(PNL_COLOR_SATURATION_PCT, 0)} ${t('holdingLegendGain')}</span>
            <small>${t('holdingLegendNeutral')}</small>
        </div>
    `;
}

function renderMinorHoldings(rows, colors) {
    const visibleRows = rows.slice(0, MINOR_VISIBLE_COUNT);
    const hiddenRows = rows.slice(MINOR_VISIBLE_COUNT);
    const renderChips = items => items.map(row => renderMinorChip(row, colors)).join('');
    return `
        <div class="holding-treemap-minor">
            <span class="holding-treemap-minor-title">${t('holdingTreemapMinor', { weight: MINOR_HOLDING_WEIGHT })}</span>
            <ul>${renderChips(visibleRows)}</ul>
            ${hiddenRows.length > 0 ? `
                <details class="holding-treemap-minor-more">
                    <summary>${t('holdingTreemapMinorMore', { count: hiddenRows.length })}</summary>
                    <ul>${renderChips(hiddenRows)}</ul>
                </details>
            ` : ''}
        </div>
    `;
}

function renderMinorChip(row, colors) {
    const stale = isStalePrice(row);
    return `
        <li>
            <button type="button" class="${stale ? 'stale' : ''}" data-holding-chart-id="${escapeHtml(row.id)}" title="${escapeHtml(`${row.name} · ${t('holdingChartClickToEdit')}`)}">
                <i style="background:${pnlColor(row, colors)}"></i>
                <span>${escapeHtml(chartHoldingName(row))}</span>
                <strong>${formatWeight(row.weight)}</strong>
                ${row.assetClass === 'cash' ? '' : `<small class="${signedClass(row.unrealizedPnl)}">${formatPercent(row.unrealizedPnlPct)}</small>`}
            </button>
        </li>
    `;
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
    if (row) return formatHoldingTooltip(row);
    return `<strong>${escapeHtml(params.name)}</strong><br>${t('marketValue')}: ${formatCurrency(params.data?.marketValue, state.amountsHidden)}<br>${t('weight')}: ${formatWeight(params.data?.weight)}`;
}
