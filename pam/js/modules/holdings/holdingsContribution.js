import { state } from '../../config/state.js';
import { t } from '../../config/i18n.js';
import { escapeHtml, formatCurrency, formatNumber, formatWeight, signedClass } from '../../utils/formatter.js';
import {
    barChartHeight,
    barNameLabelWidth,
    chartHoldingName,
    countStaleRows,
    disposeHoldingChart,
    formatHoldingTooltip,
    getChartColors,
    getFilterScopeNote,
    hasECharts,
    holdingDetailLines,
    holdingTooltipOption,
    initHoldingChart,
    isStackedBarLayout,
    renderChartFootnote,
    renderHoldingEditButton,
    renderChartNotice,
    splitCashRows,
    withAlpha
} from './holdingsChartShared.js';

export function renderHoldingContribution(el, rows) {
    // Phones get an HTML list: a diverging bar puts its value label at the bar end, which collides
    // with names or clips at the edge on narrow screens. The list needs no chart library either.
    const stacked = isStackedBarLayout(el);
    if (!stacked && !hasECharts()) {
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

    const items = investedRows
        .map(row => ({ row, contribution: (Number(row.unrealizedPnl) || 0) / totalCost * 100 }))
        .sort((a, b) => b.contribution - a.contribution);
    const staleCount = countStaleRows(investedRows);
    // Bar length is proportional to the P/L amount (shared denominator), so the amount can lead when visible.
    const formatItemValue = item => (state.amountsHidden ? formatPoints(item.contribution) : formatSignedCurrency(item.row.unrealizedPnl));
    const footnote = renderChartFootnote([
        t('holdingContributionHint'),
        staleCount > 0 ? t('holdingChartStaleNote', { count: staleCount }) : '',
        cashWeight > 0 ? t('holdingChartCashInCost', { weight: formatWeight(cashWeight) }) : '',
        getFilterScopeNote()
    ].filter(Boolean).join(' '));

    if (stacked) {
        disposeHoldingChart();
        el.innerHTML = `${renderContributionList(items, formatItemValue)}${footnote}`;
        return;
    }

    const colors = getChartColors();
    // The panel header already shows the total these bars add up to.
    el.innerHTML = `
        <div class="holding-chart-canvas holding-bar-canvas" style="height:${barChartHeight(items.length)}px"></div>
        ${footnote}
    `;
    // Bars and name labels are both clickable; label events may only carry the category value.
    const chart = initHoldingChart(el.querySelector('.holding-chart-canvas'), params => (
        Number.isInteger(params.dataIndex)
            ? items[params.dataIndex]?.row
            : items.find(item => chartHoldingName(item.row) === params.value)?.row
    ));
    chart.setOption({
        grid: { top: 8, right: 16, bottom: 44, left: 8, containLabel: true },
        tooltip: holdingTooltipOption(params => {
            const item = items[params.dataIndex];
            return item ? formatHoldingTooltip(item.row, [`${t('holdingContributionLabel')}: ${formatPoints(item.contribution)}`]) : '';
        }),
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
                width: barNameLabelWidth(el, items.map(item => `${chartHoldingName(item.row)} ${formatWeight(item.row.weight)}`)),
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
                formatter: params => formatItemValue(items[params.dataIndex])
            }
        }]
    });
}

// Each row: name, weight and amount on one line, then a full-width bar centered on zero. Tapping a
// row expands its details (minus the name line, already in the row) with an edit button, matching
// the touch tooltip in chart views.
function renderContributionList(items, formatItemValue) {
    const maxAbs = Math.max(...items.map(item => Math.abs(item.contribution)), 0) || 1;
    return `
        <ol class="holding-contribution-list">${items.map(item => {
            const share = Math.abs(item.contribution) / maxAbs * 50;
            const side = item.contribution >= 0 ? 'gain' : 'loss';
            return `
                <li class="${side}">
                    <details>
                        <summary>
                            <span class="holding-contribution-head">
                                <span class="holding-contribution-name">${escapeHtml(chartHoldingName(item.row))}<small>${formatWeight(item.row.weight)}</small></span>
                                <strong class="${signedClass(item.contribution)}">${formatItemValue(item)}</strong>
                            </span>
                            <span class="holding-contribution-track" aria-hidden="true"><i style="width:${share.toFixed(2)}%"></i></span>
                        </summary>
                        <div class="holding-contribution-detail">
                            ${holdingDetailLines(item.row, [`${t('holdingContributionLabel')}: ${formatPoints(item.contribution)}`]).slice(1).join('<br>')}
                            <div>${renderHoldingEditButton(item.row)}</div>
                        </div>
                    </details>
                </li>
            `;
        }).join('')}</ol>
    `;
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
