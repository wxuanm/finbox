import { t } from '../../config/i18n.js';
import { formatPercent, formatWeight } from '../../utils/formatter.js';
import {
    formatHoldingTooltip,
    getChartColors,
    hasECharts,
    initHoldingChart,
    renderChartFootnote,
    renderChartNotice,
    splitCashRows,
    withAlpha
} from './holdingsChartShared.js';

const BAR_ROW_HEIGHT = 34;
const CHART_VERTICAL_PADDING = 56;
const MIN_CHART_HEIGHT = 220;

export function renderHoldingContribution(el, rows) {
    if (!hasECharts()) {
        renderChartNotice(el, t('chartLibraryFailed'));
        return;
    }

    const { investedRows, cashWeight } = splitCashRows(rows);
    // Contribution uses the whole filtered portfolio cost, so bars sum to the filtered portfolio return.
    const totalCost = rows.reduce((sum, row) => sum + Math.max(Number(row.costAmount) || 0, 0), 0);
    if (investedRows.length === 0 || totalCost <= 0) {
        renderChartNotice(el, t('holdingPnlChartEmpty'));
        return;
    }

    const colors = getChartColors();
    const items = investedRows
        .map(row => ({ row, contribution: (Number(row.unrealizedPnl) || 0) / totalCost * 100 }))
        .sort((a, b) => b.contribution - a.contribution);
    const totalContribution = items.reduce((sum, item) => sum + item.contribution, 0);
    const height = Math.max(MIN_CHART_HEIGHT, items.length * BAR_ROW_HEIGHT + CHART_VERTICAL_PADDING);

    el.innerHTML = `
        <div class="holding-chart-summary">
            <span>${t('holdingContributionTotal')}</span>
            <strong class="${totalContribution > 0 ? 'positive' : totalContribution < 0 ? 'negative' : ''}">${formatPercent(totalContribution)}</strong>
        </div>
        <div class="holding-chart-canvas" style="height:${height}px"></div>
        ${renderChartFootnote([
            t('holdingContributionHint'),
            cashWeight > 0 ? t('holdingChartCashExcluded', { weight: formatWeight(cashWeight) }) : ''
        ].filter(Boolean).join(' '))}
    `;
    const chart = initHoldingChart(el.querySelector('.holding-chart-canvas'));
    chart.setOption({
        grid: { top: 8, right: 16, bottom: 28, left: 8, containLabel: true },
        tooltip: {
            trigger: 'item',
            formatter: params => {
                const item = items[params.dataIndex];
                return item ? formatHoldingTooltip(item.row, [`${t('holdingContributionLabel')}: ${formatPercent(item.contribution)}`]) : '';
            }
        },
        xAxis: {
            type: 'value',
            // Leave room on both sides for the value labels at bar ends.
            boundaryGap: ['18%', '18%'],
            axisLabel: { color: colors.muted, formatter: value => `${value}%` },
            splitLine: { lineStyle: { color: colors.border } }
        },
        yAxis: {
            type: 'category',
            inverse: true,
            data: items.map(item => item.row.name),
            axisTick: { show: false },
            axisLine: { lineStyle: { color: colors.neutral } },
            axisLabel: {
                width: 128,
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
                formatter: params => formatPercent(params.value)
            }
        }]
    });
}
