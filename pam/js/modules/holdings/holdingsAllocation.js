import { t } from '../../config/i18n.js';
import { escapeHtml, formatWeight } from '../../utils/formatter.js';
import {
    barCategoryAxisLabel,
    barChartHeight,
    barThickness,
    chartHoldingName,
    countStaleRows,
    formatHoldingTooltip,
    getChartColors,
    getFilterScopeNote,
    hasECharts,
    holdingTooltipOption,
    initHoldingChart,
    isStackedBarLayout,
    renderChartFootnote,
    renderChartNotice,
    splitCashRows,
    withAlpha
} from './holdingsChartShared.js';

// Top-N share is the simplest concentration signal; only meaningful when there are more holdings than N.
const TOP_HOLDING_COUNT = 5;

// One bar per invested holding, sorted by weight. Single hue on purpose: this view answers "where is
// the money", so P/L color stays in the P/L sources view. Cash is a stat above the chart rather than
// a bar, so the bars stay in strict descending order.
export function renderHoldingAllocation(el, rows) {
    if (!hasECharts()) {
        renderChartNotice(el, t('chartLibraryFailed'));
        return;
    }

    const { investedRows, cashWeight } = splitCashRows(rows);
    const items = [...investedRows].sort((a, b) => b.marketValue - a.marketValue);
    if (items.length === 0) {
        renderChartNotice(el, cashWeight > 0 ? t('holdingAllocationCashOnly') : t('holdingAllocationEmpty'));
        return;
    }

    const stats = renderAllocationStats(items, cashWeight);
    const notes = renderChartFootnote([
        countStaleRows(items) > 0 ? t('holdingChartStaleNote', { count: countStaleRows(items) }) : '',
        getFilterScopeNote()
    ].filter(Boolean).join(' '));

    // A single bar always fills the axis and says nothing a sentence can't.
    if (items.length === 1) {
        renderChartNotice(el, t('holdingAllocationSingle', { name: escapeHtml(items[0].name), weight: formatWeight(items[0].weight) }));
        el.insertAdjacentHTML('afterbegin', stats);
        el.insertAdjacentHTML('beforeend', notes);
        return;
    }

    const colors = getChartColors();
    const names = items.map(chartHoldingName);
    const stacked = isStackedBarLayout(el);
    el.innerHTML = `
        ${stats}
        <div class="holding-chart-canvas holding-bar-canvas" style="height:${barChartHeight(items.length, stacked)}px"></div>
        ${notes}
    `;
    const chart = initHoldingChart(el.querySelector('.holding-chart-canvas'), params => (
        Number.isInteger(params.dataIndex)
            ? items[params.dataIndex]
            : items.find(row => chartHoldingName(row) === params.value)
    ));
    chart.setOption({
        grid: stacked
            ? { top: 20, right: 44, bottom: 4, left: 0, containLabel: false }
            : { top: 4, right: 52, bottom: 4, left: 8, containLabel: true },
        tooltip: holdingTooltipOption(params => {
            const row = items[params.dataIndex];
            return row ? formatHoldingTooltip(row) : '';
        }),
        // Every bar carries its weight label, so the value axis stays hidden.
        xAxis: { type: 'value', min: 0, show: false },
        yAxis: {
            type: 'category',
            inverse: true,
            data: names,
            triggerEvent: true,
            axisTick: { show: false },
            axisLine: { show: !stacked, lineStyle: { color: colors.border } },
            axisLabel: barCategoryAxisLabel(el, names, colors)
        },
        series: [{
            type: 'bar',
            barWidth: barThickness(el),
            data: items.map(row => Number(row.weight) || 0),
            itemStyle: {
                color: withAlpha(colors.primary, 0.72),
                borderRadius: [0, 4, 4, 0]
            },
            emphasis: { itemStyle: { color: colors.primary } },
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

function renderAllocationStats(items, cashWeight) {
    const top = items[0];
    const topWeight = items.slice(0, TOP_HOLDING_COUNT).reduce((sum, row) => sum + (Number(row.weight) || 0), 0);
    const stats = [
        [t('holdingAllocationLargest'), formatWeight(top.weight), top.name],
        items.length > TOP_HOLDING_COUNT ? [t('holdingAllocationTopShare', { count: TOP_HOLDING_COUNT }), formatWeight(topWeight), ''] : null,
        cashWeight > 0 ? [t('holdingAllocationCash'), formatWeight(cashWeight), ''] : null
    ].filter(Boolean);
    return `
        <dl class="holding-chart-stats">${stats.map(([label, value, detail]) => `
            <div>
                <dt>${label}</dt>
                <dd><strong>${value}</strong>${detail ? `<small title="${escapeHtml(detail)}">${escapeHtml(detail)}</small>` : ''}</dd>
            </div>
        `).join('')}</dl>
    `;
}
