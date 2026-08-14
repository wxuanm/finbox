import { state, PERIODS } from '../../config/state.js';
import { periodLabel, t } from '../../config/i18n.js';
import { formatPercent } from '../../utils/formatter.js';

let chartInstance = null;
const ANNUALIZED_BENCHMARK_RATE = 0.10;
const DAY_MS = 24 * 60 * 60 * 1000;

export function renderPeriodSwitch() {
    const wrap = document.getElementById('periodSwitch');
    if (!wrap) return;
    wrap.innerHTML = PERIODS.map(([key]) => `
        <button class="period-chip${state.selectedPeriod === key ? ' active' : ''}" type="button" data-period="${key}">${periodLabel(key)}</button>
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
        messageEl.textContent = t('chartLibraryFailed');
        messageEl.classList.add('error');
        chartEl.innerHTML = '';
        return;
    }

    if (validMetrics.length === 0) {
        messageEl.textContent = t('chartEmpty');
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
        const baseUnitNav = metric.periodPoints[0]?.unitNav;
        const data = buildReturnSeries(metric.periodPoints, baseUnitNav, metric.account.name);
        return {
            name: `${metric.account.name} ${formatPercent(metric.periodReturn)}`,
            type: 'line',
            showSymbol: false,
            smooth: false,
            emphasis: { focus: 'series' },
            lineStyle: {
                width: selected ? 3 : 1.8,
                opacity: !state.selectedHighlightAccountId || selected ? 1 : 0.22
            },
            data
        };
    });
    const benchmarkSeries = buildBenchmarkSeries(validMetrics);
    const selectedMetric = validMetrics.find(metric => metric.account.id === state.selectedHighlightAccountId);
    const drawdownSeries = selectedMetric ? buildDrawdownSeries(selectedMetric) : [];
    const zeroLineSeries = buildZeroLineSeries(series[0]?.data || benchmarkSeries.data || []);
    const axisMirrorSeries = {
        name: '__axis_mirror__',
        type: 'line',
        yAxisIndex: 1,
        data: [...series, benchmarkSeries].flatMap(item => (item.data || []).map(point => point.value)),
        showSymbol: false,
        silent: true,
        tooltip: { show: false },
        lineStyle: { opacity: 0 },
        itemStyle: { opacity: 0 },
        emphasis: { disabled: true }
    };

    chartInstance.setOption({
        color: ['#2563eb', '#0891b2', '#f59e0b', '#ef4444', '#059669', '#6366f1', '#ec4899', '#64748b'],
        tooltip: {
            trigger: 'axis',
            formatter: formatChartTooltip
        },
        legend: {
            type: 'scroll',
            top: 0,
            data: [...series, benchmarkSeries].map(item => item.name),
            textStyle: { color: getCssVar('--text-color') }
        },
        grid: { top: 46, right: 54, bottom: 34, left: 54 },
        xAxis: { type: 'time', boundaryGap: false },
        yAxis: [
            {
                type: 'value',
                axisLabel: { formatter: '{value}%' },
                splitLine: { lineStyle: { color: getCssVar('--border-color') } }
            },
            {
                type: 'value',
                position: 'right',
                axisLabel: { formatter: '{value}%' },
                axisTick: { show: false },
                axisLine: { show: false },
                splitLine: { show: false }
            }
        ],
        dataZoom: [{ type: 'inside' }],
        series: [...series, benchmarkSeries, zeroLineSeries, ...drawdownSeries, axisMirrorSeries]
    });
}

export function resizeChart() {
    if (chartInstance) chartInstance.resize();
}

function getCssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function buildReturnSeries(points, baseUnitNav, accountName) {
    if (!Number.isFinite(baseUnitNav) || baseUnitNav <= 0) return [];
    return points.map(point => ({
        value: [point.date, (point.unitNav / baseUnitNav - 1) * 100],
        accountName
    }));
}

function buildBenchmarkSeries(metrics) {
    const dates = [...new Set(metrics.flatMap(metric => metric.periodPoints.map(point => point.date)))].sort();
    const startDate = dates[0];
    const startTime = parseDate(startDate)?.getTime();
    const data = Number.isFinite(startTime)
        ? dates.map(date => {
            const time = parseDate(date)?.getTime();
            const days = Number.isFinite(time) ? Math.max((time - startTime) / DAY_MS, 0) : 0;
            return {
                value: [date, ((1 + ANNUALIZED_BENCHMARK_RATE) ** (days / 365) - 1) * 100],
                accountName: t('annualizedBenchmark10')
            };
        })
        : [];

    return {
        name: t('annualizedBenchmark10'),
        type: 'line',
        showSymbol: false,
        smooth: false,
        silent: false,
        emphasis: { focus: 'series' },
        lineStyle: {
            color: getCssVar('--text-muted') || '#64748b',
            type: 'dashed',
            width: 1.6,
            opacity: 0.9
        },
        data
    };
}

function buildZeroLine() {
    return {
        symbol: 'none',
        silent: true,
        label: { show: false },
        lineStyle: {
            color: getCssVar('--border-strong') || '#cbd5e1',
            type: 'dashed',
            width: 1
        },
        data: [{ yAxis: 0 }]
    };
}

function buildZeroLineSeries(data) {
    return {
        name: '__zero_line__',
        type: 'line',
        data,
        showSymbol: false,
        silent: true,
        tooltip: { show: false },
        lineStyle: { opacity: 0 },
        itemStyle: { opacity: 0 },
        markLine: buildZeroLine(),
        emphasis: { disabled: true },
        z: 0
    };
}

function buildDrawdownSeries(metric) {
    const baseUnitNav = metric.periodPoints[0]?.unitNav;
    if (!Number.isFinite(baseUnitNav) || baseUnitNav <= 0) return [];

    let peakReturn = 0;
    const baseData = [];
    const drawdownData = [];
    metric.periodPoints.forEach(point => {
        const returnValue = (point.unitNav / baseUnitNav - 1) * 100;
        if (!Number.isFinite(returnValue)) return;
        peakReturn = Math.max(peakReturn, returnValue);
        baseData.push([point.date, returnValue]);
        drawdownData.push([point.date, peakReturn - returnValue]);
    });

    if (drawdownData.every(point => point[1] <= 0)) return [];

    const stackName = `drawdown-${metric.account.id}`;
    return [
        {
            name: '__drawdown_base__',
            type: 'line',
            stack: stackName,
            data: baseData,
            showSymbol: false,
            silent: true,
            tooltip: { show: false },
            lineStyle: { opacity: 0 },
            itemStyle: { opacity: 0 },
            emphasis: { disabled: true },
            z: 0
        },
        {
            name: '__drawdown_area__',
            type: 'line',
            stack: stackName,
            data: drawdownData,
            showSymbol: false,
            silent: true,
            tooltip: { show: false },
            lineStyle: { opacity: 0 },
            itemStyle: { opacity: 0 },
            areaStyle: {
                color: getCssVar('--negative-bg') || 'rgba(16, 185, 129, 0.1)',
                opacity: 0.8
            },
            emphasis: { disabled: true },
            z: 0
        }
    ];
}

function formatChartTooltip(params) {
    const items = (Array.isArray(params) ? params : [params])
        .filter(item => !String(item.seriesName || '').startsWith('__'));
    if (items.length === 0) return '';

    const title = items[0].axisValueLabel || items[0].value?.[0] || '';
    return [
        title,
        ...items.map(item => {
            const value = Array.isArray(item.value) ? item.value[1] : item.value;
            return `${item.marker || ''}${item.data?.accountName || item.seriesName}: ${formatPercent(Number(value))}`;
        })
    ].join('<br/>');
}

function parseDate(date) {
    const parsed = new Date(`${date}T00:00:00`);
    return Number.isFinite(parsed.getTime()) ? parsed : null;
}
