import { state, PERIODS } from '../../config/state.js';
import { formatPercent } from '../../utils/formatter.js';

let chartInstance = null;

export function renderPeriodSwitch() {
    const wrap = document.getElementById('periodSwitch');
    if (!wrap) return;
    wrap.innerHTML = PERIODS.map(([key, label]) => `
        <button class="period-chip${state.selectedPeriod === key ? ' active' : ''}" type="button" data-period="${key}">${label}</button>
    `).join('');
}

export function bindPeriodSwitch(onChange) {
    const wrap = document.getElementById('periodSwitch');
    if (!wrap) return;
    wrap.addEventListener('click', event => {
        const chip = event.target.closest('[data-period]');
        if (!chip) return;
        onChange(chip.dataset.period);
    });
}

export function renderPerformanceChart(metrics) {
    const chartEl = document.getElementById('performanceChart');
    const messageEl = document.getElementById('chartMessage');
    if (!chartEl || !messageEl) return;

    const validMetrics = metrics.filter(metric => metric.valid && metric.periodPoints.length >= 2);
    if (typeof window.echarts === 'undefined') {
        messageEl.textContent = '图表库加载失败，账户数据仍可正常维护。';
        messageEl.classList.add('error');
        chartEl.innerHTML = '';
        return;
    }

    if (validMetrics.length === 0) {
        messageEl.textContent = '录入至少一个账户的两条有效快照后，将显示收益走势。';
        messageEl.classList.remove('error');
        if (chartInstance) chartInstance.dispose();
        chartInstance = null;
        chartEl.innerHTML = '';
        return;
    }

    messageEl.textContent = '';
    messageEl.classList.remove('error');
    if (chartInstance) chartInstance.dispose();
    chartInstance = window.echarts.init(chartEl);

    const series = validMetrics.map(metric => {
        const selected = state.selectedHighlightAccountId === metric.account.id;
        return {
            name: metric.account.name,
            type: 'line',
            showSymbol: false,
            smooth: true,
            emphasis: { focus: 'series' },
            lineStyle: {
                width: selected ? 3 : 1.8,
                opacity: !state.selectedHighlightAccountId || selected ? 1 : 0.22
            },
            data: metric.periodPoints.map(point => [point.date, point.returnPct])
        };
    });

    chartInstance.setOption({
        color: ['#7c3aed', '#06b6d4', '#f59e0b', '#ef4444', '#10b981', '#2563eb', '#ec4899', '#64748b'],
        tooltip: {
            trigger: 'axis',
            valueFormatter: value => formatPercent(Number(value))
        },
        legend: {
            type: 'scroll',
            top: 0,
            textStyle: { color: getCssVar('--text-color') }
        },
        grid: { top: 46, right: 28, bottom: 34, left: 54 },
        xAxis: { type: 'time', boundaryGap: false },
        yAxis: {
            type: 'value',
            axisLabel: { formatter: '{value}%' },
            splitLine: { lineStyle: { color: getCssVar('--border-color') } }
        },
        dataZoom: [{ type: 'inside' }],
        series
    });
}

export function resizeChart() {
    if (chartInstance) chartInstance.resize();
}

function getCssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
