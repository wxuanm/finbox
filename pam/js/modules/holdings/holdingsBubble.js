import { t } from '../../config/i18n.js';
import { formatWeight } from '../../utils/formatter.js';
import {
    formatHoldingTooltip,
    getChartColors,
    hasECharts,
    initHoldingChart,
    pnlColor,
    renderChartFootnote,
    renderChartNotice,
    splitCashRows,
    withAlpha
} from './holdingsChartShared.js';

const MIN_BUBBLE_SIZE = 10;
const MAX_BUBBLE_SIZE = 46;

export function renderHoldingBubble(el, rows) {
    if (!hasECharts()) {
        renderChartNotice(el, t('chartLibraryFailed'));
        return;
    }

    const { investedRows, cashWeight } = splitCashRows(rows);
    if (investedRows.length === 0) {
        renderChartNotice(el, t('holdingPnlChartEmpty'));
        return;
    }

    const colors = getChartColors();
    const averageWeight = investedRows.reduce((sum, row) => sum + (Number(row.weight) || 0), 0) / investedRows.length;
    const maxAbsPnl = Math.max(...investedRows.map(row => Math.abs(Number(row.unrealizedPnl) || 0)), 0);
    const data = investedRows.map(row => ({
        name: row.name,
        value: [Number(row.weight) || 0, Number.isFinite(Number(row.unrealizedPnlPct)) ? Number(row.unrealizedPnlPct) : 0],
        row,
        symbolSize: bubbleSize(row.unrealizedPnl, maxAbsPnl),
        itemStyle: {
            color: pnlColor(row, colors),
            borderColor: withAlpha(Number(row.unrealizedPnl) >= 0 ? colors.positive : colors.negative, 0.9),
            borderWidth: 1
        }
    }));

    el.innerHTML = `
        <div class="holding-chart-canvas"></div>
        ${renderChartFootnote([
            t('holdingBubbleHint'),
            cashWeight > 0 ? t('holdingChartCashExcluded', { weight: formatWeight(cashWeight) }) : ''
        ].filter(Boolean).join(' '))}
    `;
    const chart = initHoldingChart(el.querySelector('.holding-chart-canvas'));
    chart.setOption({
        grid: { top: 28, right: 24, bottom: 44, left: 16, containLabel: true },
        tooltip: {
            trigger: 'item',
            formatter: params => params.data?.row ? formatHoldingTooltip(params.data.row) : ''
        },
        xAxis: {
            type: 'value',
            name: t('weight'),
            nameLocation: 'middle',
            nameGap: 28,
            min: 0,
            nameTextStyle: { color: colors.muted, fontWeight: 700 },
            axisLabel: { color: colors.muted, formatter: value => `${value}%` },
            splitLine: { lineStyle: { color: colors.border } }
        },
        yAxis: {
            type: 'value',
            name: t('holdingBubbleYAxis'),
            nameTextStyle: { color: colors.muted, fontWeight: 700, align: 'left' },
            axisLabel: { color: colors.muted, formatter: value => `${value}%` },
            splitLine: { lineStyle: { color: colors.border } }
        },
        series: [{
            type: 'scatter',
            data,
            label: {
                show: true,
                position: 'top',
                color: colors.text,
                fontSize: 11,
                fontWeight: 700,
                formatter: params => params.name
            },
            labelLayout: { hideOverlap: true },
            emphasis: { focus: 'self', label: { show: true } },
            markLine: {
                silent: true,
                symbol: 'none',
                lineStyle: { color: colors.neutral, type: 'dashed', width: 1 },
                label: { color: colors.muted, fontSize: 10 },
                data: [
                    { yAxis: 0, label: { formatter: '0%', position: 'end' } },
                    { xAxis: averageWeight, label: { formatter: t('holdingBubbleAvgWeight', { weight: formatWeight(averageWeight) }), position: 'end' } }
                ]
            }
        }]
    });
}

function bubbleSize(pnl, maxAbsPnl) {
    const value = Math.abs(Number(pnl) || 0);
    if (maxAbsPnl <= 0) return MIN_BUBBLE_SIZE;
    // Square-root scaling makes bubble area, rather than diameter, track the P/L amount.
    return MIN_BUBBLE_SIZE + Math.sqrt(value / maxAbsPnl) * (MAX_BUBBLE_SIZE - MIN_BUBBLE_SIZE);
}
