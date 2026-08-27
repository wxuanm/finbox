import { state, PERIODS } from '../../config/state.js';
import { periodLabel, t } from '../../config/i18n.js';
import { formatChartAxisPercent, formatPercent } from '../../utils/formatter.js';

let chartInstance = null;
let chartContext = null;
let rebasingChart = false;
const ANNUALIZED_BENCHMARK_RATE = 0.10;
const DAY_MS = 24 * 60 * 60 * 1000;
const INTERNAL_SERIES_PREFIX = '__';
const MAX_DRAWDOWN_SEGMENT_SERIES_NAME = '__max_drawdown_segment__';
const CHART_LINE_WIDTH = 2.5;
const CHART_FOCUSED_LINE_WIDTH = 3.2;
const CHART_DRAWDOWN_LINE_WIDTH = 3;
const CHART_BENCHMARK_LINE_WIDTH = 1.5;
const CHART_SELECTED_LINE_COLOR = '#4f46e5';

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

    chartContext = { metrics: validMetrics, zoomRange: buildPerformanceZoomRange(validMetrics) };
    const chartParts = buildPerformanceChartParts(chartContext);

    chartInstance.setOption({
        color: ['#2563eb', '#0891b2', '#f59e0b', '#ef4444', '#059669', '#6366f1', '#ec4899', '#64748b'],
        tooltip: {
            trigger: 'axis',
            formatter: formatChartTooltip
        },
        legend: {
            type: 'scroll',
            top: 0,
            data: chartParts.accountSeries.map(item => item.name),
            textStyle: { color: getCssVar('--text-color') }
        },
        grid: { top: 46, right: 54, bottom: 64, left: 54 },
        xAxis: { type: 'time', boundaryGap: false },
        yAxis: [
            {
                type: 'value',
                axisLabel: { formatter: value => formatChartAxisPercent(value) },
                splitLine: { lineStyle: { color: getCssVar('--border-color') } }
            },
            {
                type: 'value',
                position: 'right',
                axisLabel: { formatter: value => formatChartAxisPercent(value) },
                axisTick: { show: false },
                axisLine: { show: false },
                splitLine: { show: false }
            }
        ],
        dataZoom: [
            { id: 'performance-inside-zoom', type: 'inside', xAxisIndex: 0, filterMode: 'none', throttle: 60, ...chartContext.zoomRange },
            {
                id: 'performance-slider-zoom',
                type: 'slider',
                xAxisIndex: 0,
                filterMode: 'none',
                ...chartContext.zoomRange,
                height: 26,
                bottom: 16,
                borderColor: getCssVar('--border-color') || '#e5e7eb',
                backgroundColor: getCssVar('--surface-color') || 'transparent',
                fillerColor: getCssVar('--primary-soft') || 'rgba(79, 70, 229, 0.16)',
                handleStyle: { color: getCssVar('--primary-color') || '#4f46e5' },
                textStyle: { color: getCssVar('--muted-text') || '#64748b' }
            }
        ],
        series: chartParts.series
    });
    bindLegendMarkerFocus(validMetrics);
    bindChartRebase();
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

function buildAccountChartSeries(metrics, markerAccountId = state.selectedHighlightAccountId, focusAccountId = state.selectedHighlightAccountId, zoomBounds = null) {
    return metrics.map(metric => {
        const focused = focusAccountId === metric.account.id;
        const showReturnMarkers = metrics.length === 1 || markerAccountId === metric.account.id;
        const points = metric.points || metric.periodPoints;
        const basePoint = zoomBounds ? findPerformanceBasePoint(points, zoomBounds.startTime) : metric.periodPoints[0];
        const baseUnitNav = basePoint?.unitNav;
        const data = buildReturnSeries(points, baseUnitNav, metric.account.name);
        const visibleData = filterPerformanceSeriesByZoom(data, zoomBounds);
        const focusedColor = getCssVar('--primary-color') || CHART_SELECTED_LINE_COLOR;
        const highPoint = showReturnMarkers ? getHighestSeriesPoint(visibleData) : null;
        const lastPoint = showReturnMarkers ? getLastSeriesPoint(visibleData) : null;
        const markPointData = [];

        if (highPoint && (!lastPoint || highPoint[0] !== lastPoint[0] || highPoint[1] !== lastPoint[1])) {
            markPointData.push({
                name: 'High',
                coord: highPoint,
                value: highPoint[1],
                label: { position: 'top' }
            });
        }

        if (lastPoint) {
            markPointData.push({
                name: 'Latest',
                coord: lastPoint,
                value: lastPoint[1],
                label: { position: 'top' }
            });
        }

        return {
            name: metric.account.name,
            type: 'line',
            showSymbol: false,
            smooth: false,
            emphasis: { focus: 'none' },
            lineStyle: {
                width: focused ? CHART_FOCUSED_LINE_WIDTH : CHART_LINE_WIDTH,
                color: focused ? focusedColor : undefined,
                opacity: !focusAccountId || focused ? 1 : 0.18
            },
            itemStyle: focused ? { color: focusedColor } : undefined,
            data,
            markPoint: markPointData.length > 0 ? {
                symbol: 'circle',
                symbolSize: focused ? 10 : 8,
                itemStyle: {
                    opacity: showReturnMarkers ? 1 : 0
                },
                label: {
                    formatter: params => formatPercent(Number(params.value), 2),
                    color: getCssVar('--text-color') || '#0f172a',
                    fontSize: 10,
                    fontWeight: 800,
                    opacity: showReturnMarkers ? 1 : 0
                },
                data: markPointData
            } : undefined
        };
    });
}

function getHighestSeriesPoint(data) {
    return (data || []).reduce((highest, point) => {
        const value = Number(point?.value?.[1]);
        if (!Number.isFinite(value)) return highest;
        if (!highest || value > highest[1]) return [point.value[0], value];
        return highest;
    }, null);
}

function getLastSeriesPoint(data) {
    for (let index = (data || []).length - 1; index >= 0; index -= 1) {
        const point = data[index];
        const value = Number(point?.value?.[1]);
        if (Number.isFinite(value)) return [point.value[0], value];
    }

    return null;
}

function buildBenchmarkSeries(metrics, zoomBounds = null) {
    const dates = [...new Set(metrics.flatMap(metric => (metric.points || metric.periodPoints).map(point => point.date)))].sort();
    const startTime = Number.isFinite(zoomBounds?.startTime) ? zoomBounds.startTime : parseDate(dates[0])?.getTime();
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
        emphasis: { disabled: true },
        lineStyle: {
            color: getCssVar('--text-muted') || '#64748b',
            type: 'dashed',
            width: CHART_BENCHMARK_LINE_WIDTH,
            opacity: 0.9
        },
        data
    };
}

function bindLegendMarkerFocus(metrics) {
    const updateMarkerFocus = (markerAccountId, focusAccountId = markerAccountId) => {
        const focusedParts = buildPerformanceChartParts(chartContext, markerAccountId, focusAccountId);
        chartInstance.setOption({
            series: focusedParts.series
        }, false);
    };

    chartInstance.on('mouseover', params => {
        if (params.componentType !== 'legend') return;
        const metric = findMetricBySeriesName(metrics, params.name);
        if (!metric) return;
        updateMarkerFocus(metric.account.id, metric.account.id);
    });

    chartInstance.on('mouseout', params => {
        if (params.componentType !== 'legend') return;
        updateMarkerFocus(state.selectedHighlightAccountId, state.selectedHighlightAccountId);
    });

    chartInstance.on('highlight', params => {
        const seriesName = params.batch?.[0]?.seriesName || params.seriesName;
        const metric = findMetricBySeriesName(metrics, seriesName);
        if (!metric) return;
        updateMarkerFocus(metric.account.id, metric.account.id);
    });

    chartInstance.on('downplay', () => {
        updateMarkerFocus(state.selectedHighlightAccountId, state.selectedHighlightAccountId);
    });
}

function bindChartRebase() {
    chartInstance.off('datazoom');
    chartInstance.on('datazoom', () => {
        if (!chartInstance || !chartContext || rebasingChart) return;

        const option = chartInstance.getOption();
        const zoom = Array.isArray(option.dataZoom) ? option.dataZoom[0] : null;
        chartContext.zoomRange = {
            start: Number.isFinite(zoom?.start) ? zoom.start : 0,
            end: Number.isFinite(zoom?.end) ? zoom.end : 100
        };

        const chartParts = buildPerformanceChartParts(chartContext);
        rebasingChart = true;
        chartInstance.setOption({ series: chartParts.series }, false);
        rebasingChart = false;
    });
}

function getPerformanceZoomBounds(metrics, zoomRange) {
    if (!zoomRange) return null;

    const times = metrics
        .flatMap(metric => (metric.points || metric.periodPoints).map(point => parseDate(point.date)?.getTime()))
        .filter(time => Number.isFinite(time))
        .sort((a, b) => a - b);
    const firstTime = times[0];
    const lastTime = times[times.length - 1];
    if (!Number.isFinite(firstTime) || !Number.isFinite(lastTime) || firstTime >= lastTime) return null;

    const start = Number.isFinite(zoomRange.start) ? Math.max(0, Math.min(100, zoomRange.start)) : 0;
    const end = Number.isFinite(zoomRange.end) ? Math.max(0, Math.min(100, zoomRange.end)) : 100;
    return {
        startTime: firstTime + (lastTime - firstTime) * start / 100,
        endTime: firstTime + (lastTime - firstTime) * end / 100
    };
}

function buildPerformanceZoomRange(metrics) {
    const times = metrics
        .flatMap(metric => (metric.points || metric.periodPoints).map(point => parseDate(point.date)?.getTime()))
        .filter(time => Number.isFinite(time))
        .sort((a, b) => a - b);
    const firstTime = times[0];
    const lastTime = times[times.length - 1];
    if (!Number.isFinite(firstTime) || !Number.isFinite(lastTime) || firstTime >= lastTime) return {};

    const startTime = state.selectedPeriod === 'YTD'
        ? new Date(new Date(lastTime).getFullYear(), 0, 1).getTime()
        : lastTime - getPerformancePeriodDays(state.selectedPeriod) * DAY_MS;
    const clampedStart = Math.max(firstTime, startTime);
    return {
        start: Math.max(0, Math.min(100, (clampedStart - firstTime) / (lastTime - firstTime) * 100)),
        end: 100
    };
}

function getPerformancePeriodDays(periodKey) {
    if (periodKey === '1M') return 30;
    if (periodKey === '3M') return 90;
    if (periodKey === '6M') return 180;
    if (periodKey === '1Y') return 365;
    if (periodKey === '3Y') return 365 * 3;
    return Infinity;
}

function findPerformanceBasePoint(points, startTime) {
    let fallback = null;
    for (const point of points || []) {
        const time = parseDate(point.date)?.getTime();
        if (!Number.isFinite(time)) continue;
        if (time >= startTime) return point;
        fallback = point;
    }
    return fallback;
}

function filterPerformanceSeriesByZoom(data, zoomBounds) {
    if (!zoomBounds) return data;

    return (data || []).filter(point => {
        const time = parseDate(point?.value?.[0])?.getTime();
        return Number.isFinite(time) && time >= zoomBounds.startTime && time <= zoomBounds.endTime;
    });
}

function buildAxisMirrorSeries(accountSeries, benchmarkSeries) {
    return {
        name: '__axis_mirror__',
        type: 'line',
        yAxisIndex: 1,
        data: [...accountSeries, benchmarkSeries].flatMap(item => (item.data || []).map(point => point.value)),
        showSymbol: false,
        silent: true,
        tooltip: { show: false },
        lineStyle: { opacity: 0 },
        itemStyle: { opacity: 0 },
        emphasis: { disabled: true }
    };
}

function buildPerformanceChartParts(context, markerAccountId = state.selectedHighlightAccountId, focusAccountId = state.selectedHighlightAccountId) {
    const zoomBounds = getPerformanceZoomBounds(context.metrics, context.zoomRange);
    const accountSeries = buildAccountChartSeries(context.metrics, markerAccountId, focusAccountId, zoomBounds);
    const benchmarkSeries = buildBenchmarkSeries(context.metrics, zoomBounds);
    const selectedMetric = context.metrics.find(metric => metric.account.id === state.selectedHighlightAccountId);
    const maxDrawdownMetric = selectedMetric || (context.metrics.length === 1 ? context.metrics[0] : null);
    const maxDrawdownSegmentSeries = maxDrawdownMetric ? buildAccountMaxDrawdownSegmentSeries(maxDrawdownMetric, zoomBounds) : [];
    const zeroLineSeries = buildZeroLineSeries(accountSeries[0]?.data || benchmarkSeries.data || []);
    const axisMirrorSeries = buildAxisMirrorSeries(accountSeries, benchmarkSeries);
    return {
        accountSeries,
        series: [...accountSeries, benchmarkSeries, zeroLineSeries, ...maxDrawdownSegmentSeries, axisMirrorSeries]
    };
}

function findMetricBySeriesName(metrics, seriesName) {
    return metrics.find(metric => metric.account.name === seriesName);
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

function buildAccountMaxDrawdownSegmentSeries(metric, zoomBounds = null) {
    const points = metric.points || metric.periodPoints;
    const basePoint = zoomBounds ? findPerformanceBasePoint(points, zoomBounds.startTime) : metric.periodPoints[0];
    const baseUnitNav = basePoint?.unitNav;
    if (!Number.isFinite(baseUnitNav) || baseUnitNav <= 0) return [];

    const data = points.map(point => ({
        value: [point.date, (point.unitNav / baseUnitNav - 1) * 100],
        accountName: metric.account.name
    }));
    const segmentData = getMaxDrawdownSegment(filterPerformanceSeriesByZoom(data, zoomBounds));
    if (segmentData.length < 2) return [];

    const drawdownColor = getCssVar('--negative-color') || '#059669';
    const drawdownShadowColor = getCssVar('--negative-bg') || 'rgba(5, 150, 105, 0.18)';
    return [{
        name: MAX_DRAWDOWN_SEGMENT_SERIES_NAME,
        type: 'line',
        data: segmentData,
        showSymbol: false,
        smooth: false,
        silent: true,
        tooltip: { show: false },
        lineStyle: {
            color: drawdownColor,
            width: CHART_DRAWDOWN_LINE_WIDTH,
            opacity: 1,
            shadowBlur: 4,
            shadowColor: drawdownShadowColor
        },
        itemStyle: { color: drawdownColor },
        emphasis: { disabled: true },
        z: 12
    }];
}

function getMaxDrawdownSegment(data) {
    if (!Array.isArray(data) || data.length < 2) return [];

    let peakIndex = -1;
    let peakValue = -Infinity;
    let segmentStartIndex = -1;
    let segmentEndIndex = -1;
    let maxDrawdown = 0;

    data.forEach((point, index) => {
        const returnValue = Number(point?.value?.[1]);
        if (!Number.isFinite(returnValue)) return;

        const navValue = 1 + returnValue / 100;
        if (navValue > peakValue) {
            peakValue = navValue;
            peakIndex = index;
        }

        if (peakValue <= 0 || peakIndex < 0) return;

        const drawdown = navValue / peakValue - 1;
        if (drawdown < maxDrawdown) {
            maxDrawdown = drawdown;
            segmentStartIndex = peakIndex;
            segmentEndIndex = index;
        }
    });

    if (segmentStartIndex < 0 || segmentEndIndex <= segmentStartIndex) return [];
    return data.slice(segmentStartIndex, segmentEndIndex + 1);
}

function formatChartTooltip(params) {
    const items = (Array.isArray(params) ? params : [params])
        .filter(item => !String(item.seriesName || '').startsWith(INTERNAL_SERIES_PREFIX))
        .filter(item => item.seriesName !== t('annualizedBenchmark10'));
    if (items.length === 0) return '';

    const title = items[0].axisValueLabel || items[0].value?.[0] || '';
    const rows = items.map(item => {
        const value = Array.isArray(item.value) ? item.value[1] : item.value;
        return `
            <div style="display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:8px;align-items:center;min-width:220px;">
                <span>${item.marker || ''}</span>
                <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${item.data?.accountName || item.seriesName}</span>
                <span style="font-variant-numeric:tabular-nums;text-align:right;">${formatPercent(Number(value))}</span>
            </div>
        `;
    }).join('');

    return `<div style="font-weight:700;margin-bottom:6px;">${title}</div>${rows}`;
}

function parseDate(date) {
    const parsed = new Date(`${date}T00:00:00`);
    return Number.isFinite(parsed.getTime()) ? parsed : null;
}
