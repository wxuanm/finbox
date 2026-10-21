import { state } from '../../config/state.js';
import { t } from '../../config/i18n.js';
import { formatCurrency, formatNumber, formatWeight } from '../../utils/formatter.js';
import {
    barChartHeight,
    barNameLabelWidth,
    chartHoldingName,
    countStaleRows,
    formatHoldingTooltip,
    getChartColors,
    getFilterScopeNote,
    hasECharts,
    initHoldingChart,
    renderChartFootnote,
    renderChartNotice,
    splitCashRows,
    withAlpha
} from './holdingsChartShared.js';

export function renderHoldingContribution(el, rows) {
    if (!hasECharts()) {
        renderChartNotice(el, t('chartLibraryFailed'));
        return;
    }

    const { investedRows, cashWeight } = splitCashRows(rows);
    // Contribution uses the whole filtered portfolio cost, so bars sum to the filtered holdings return.
    const totalCost = rows.reduce((sum, row) => sum + Math.max(Number(row.costAmount) || 0, 0), 0);
    if (investedRows.length === 0 || totalCost <= 0) {
        renderChartNotice(el, t('holdingPnlChartEmpty'));
        return;
    }

    const colors = getChartColors();
    const items = investedRows
        .map(row => ({ row, contribution: (Number(row.unrealizedPnl) || 0) / totalCost * 100 }))
        .sort((a, b) => b.contribution - a.contribution);
    const staleCount = countStaleRows(investedRows);
    // Bar length is proportional to the P/L amount (shared denominator), so the amount can lead when visible.
    const formatBarLabel = state.amountsHidden
        ? value => formatPoints(value)
        : (value, index) => formatSignedCurrency(items[index]?.row.unrealizedPnl);

    // The panel summary strip above the views already shows the total these bars add up to.
    el.innerHTML = `
        <div class="holding-chart-canvas" style="height:${barChartHeight(items.length)}px"></div>
        ${renderChartFootnote([
            t('holdingContributionHint'),
            staleCount > 0 ? t('holdingChartStaleNote', { count: staleCount }) : '',
            cashWeight > 0 ? t('holdingChartCashInCost', { weight: formatWeight(cashWeight) }) : '',
            getFilterScopeNote()
        ].filter(Boolean).join(' '))}
    `;
    // Bars and name labels are both clickable; label events may only carry the category value.
    const chart = initHoldingChart(el.querySelector('.holding-chart-canvas'), params => (
        Number.isInteger(params.dataIndex)
            ? items[params.dataIndex]?.row
            : items.find(item => chartHoldingName(item.row) === params.value)?.row
    ));
    chart.setOption({
        grid: { top: 8, right: 16, bottom: 44, left: 8, containLabel: true },
        tooltip: {
            trigger: 'item',
            formatter: params => {
                const item = items[params.dataIndex];
                return item ? formatHoldingTooltip(item.row, [`${t('holdingContributionLabel')}: ${formatPoints(item.contribution)}`]) : '';
            }
        },
        xAxis: {
            type: 'value',
            name: t('holdingContributionAxis'),
            nameLocation: 'middle',
            nameGap: 26,
            nameTextStyle: { color: colors.muted, fontSize: 11, fontWeight: 700 },
            // Leave room on both sides for the value labels at bar ends.
            boundaryGap: ['22%', '22%'],
            axisLabel: { color: colors.muted, formatter: value => formatNumber(value) },
            splitLine: { lineStyle: { color: colors.border } }
        },
        yAxis: {
            type: 'category',
            inverse: true,
            data: items.map(item => chartHoldingName(item.row)),
            triggerEvent: true,
            axisTick: { show: false },
            axisLine: { lineStyle: { color: colors.neutral } },
            axisLabel: {
                width: barNameLabelWidth(el),
                overflow: 'truncate',
                formatter: (name, index) => `{name|${name}} {weight|${formatWeight(items[index]?.row.weight)}}`,
                rich: {
                    name: { color: colors.text, fontSize: 12, fontWeight: 700 },
                    weight: { color: colors.muted, fontSize: 11 }
                }
            }
        },
        series: [{
            type: 'bar',
            barMaxWidth: 18,
            data: items.map(item => ({
                value: item.contribution,
                label: { position: item.contribution >= 0 ? 'right' : 'left' },
                itemStyle: {
                    color: withAlpha(item.contribution >= 0 ? colors.positive : colors.negative, 0.85),
                    borderRadius: item.contribution >= 0 ? [0, 6, 6, 0] : [6, 0, 0, 6]
                }
            })),
            label: {
                show: true,
                position: 'right',
                color: colors.text,
                fontSize: 11,
                fontWeight: 700,
                formatter: params => formatBarLabel(params.value, params.dataIndex)
            }
        }]
    });
}

// Contributions are percentage points of the filtered holdings return, not a holding's own return.
function formatPoints(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) return '-';
    return t('holdingContributionPoints', { value: `${num > 0 ? '+' : ''}${formatNumber(num)}` });
}

function formatSignedCurrency(value) {
    const num = Number(value);
    return `${num > 0 ? '+' : ''}${formatCurrency(num)}`;
}
