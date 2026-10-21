import { t } from '../../config/i18n.js';
import { formatWeight } from '../../utils/formatter.js';
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
    withAlpha
} from './holdingsChartShared.js';

// Top-N share is the simplest concentration signal; only meaningful when there are more holdings than N.
const TOP_HOLDING_COUNT = 5;

// One bar per holding, sorted by weight. Single hue on purpose: this view answers "where is the money",
// so P/L color stays in the P/L sources view.
export function renderHoldingAllocation(el, rows) {
    if (!hasECharts()) {
        renderChartNotice(el, t('chartLibraryFailed'));
        return;
    }

    // Cash stays last, matching the table.
    const items = rows
        .filter(row => Number(row.marketValue) > 0)
        .sort((a, b) => (a.assetClass === 'cash') - (b.assetClass === 'cash') || b.marketValue - a.marketValue);
    if (items.length === 0) {
        renderChartNotice(el, t('holdingAllocationEmpty'));
        return;
    }

    const colors = getChartColors();
    const investedItems = items.filter(row => row.assetClass !== 'cash');
    const topWeight = investedItems
        .slice(0, TOP_HOLDING_COUNT)
        .reduce((sum, row) => sum + (Number(row.weight) || 0), 0);
    const staleCount = countStaleRows(items);

    el.innerHTML = `
        <div class="holding-chart-canvas" style="height:${barChartHeight(items.length)}px"></div>
        ${renderChartFootnote([
            investedItems.length > TOP_HOLDING_COUNT
                ? t('holdingAllocationTop', { count: TOP_HOLDING_COUNT, weight: formatWeight(topWeight) })
                : '',
            staleCount > 0 ? t('holdingChartStaleNote', { count: staleCount }) : '',
            getFilterScopeNote()
        ].filter(Boolean).join(' '))}
    `;
    const canvas = el.querySelector('.holding-chart-canvas');
    const chart = initHoldingChart(canvas, params => (
        Number.isInteger(params.dataIndex)
            ? items[params.dataIndex]
            : items.find(row => chartHoldingName(row) === params.value)
    ));
    chart.setOption({
        grid: { top: 8, right: 16, bottom: 8, left: 8, containLabel: true },
        tooltip: {
            trigger: 'item',
            formatter: params => {
                const row = items[params.dataIndex];
                return row ? formatHoldingTooltip(row) : '';
            }
        },
        // Every bar carries its weight label, so the value axis stays hidden.
        xAxis: {
            type: 'value',
            min: 0,
            max: value => value.max * 1.18,
            show: false
        },
        yAxis: {
            type: 'category',
            inverse: true,
            data: items.map(chartHoldingName),
            triggerEvent: true,
            axisTick: { show: false },
            axisLine: { lineStyle: { color: colors.border } },
            axisLabel: {
                width: barNameLabelWidth(el),
                overflow: 'truncate',
                color: colors.text,
                fontSize: 12,
                fontWeight: 700
            }
        },
        series: [{
            type: 'bar',
            barMaxWidth: 18,
            data: items.map(row => ({
                value: Number(row.weight) || 0,
                itemStyle: {
                    color: row.assetClass === 'cash' ? withAlpha(colors.neutral, 0.9) : withAlpha(colors.primary, 0.85),
                    borderRadius: [0, 4, 4, 0]
                }
            })),
            label: {
                show: true,
                position: 'right',
                color: colors.text,
                fontSize: 11,
                fontWeight: 700,
                formatter: params => formatWeight(params.value)
            }
        }]
    });
}
