import { state, PERIODS } from '../../config/state.js';
import { periodLabel, t } from '../../config/i18n.js';
import { escapeHtml, formatChartAxisPercent, formatPercent } from '../../utils/formatter.js';
import { withAlpha } from '../holdings/holdingsChartShared.js';

let chartInstance = null;
let chartContext = null;
let rebasingChart = false;
// A manual zoom window (absolute times) survives re-renders until a period chip or the reset button clears it.
let customZoomWindow = null;
// Legend visibility keyed by account name, kept across re-renders.
let legendSelected = {};
const ANNUALIZED_BENCHMARK_RATE = 0.10;
const DAY_MS = 24 * 60 * 60 * 1000;
const INTERNAL_SERIES_PREFIX = '__';
const BENCHMARK_SERIES_ID = '__benchmark__';
const ZERO_LINE_SERIES_ID = '__zero_line__';
const MAX_DRAWDOWN_SERIES_NAME = '__max_drawdown__';
const CHART_LINE_WIDTH = 1.8;
const CHART_FOCUSED_LINE_WIDTH = 3.2;
const CHART_BENCHMARK_LINE_WIDTH = 1.5;
const CHART_GRID_LEFT = 54;
const CHART_GRID_RIGHT = 64;
const CHART_GRID_HORIZONTAL_PADDING = CHART_GRID_LEFT + CHART_GRID_RIGHT;
const CHART_Y_AXIS_TARGET_SPLITS = 5;
const CHART_SERIES_HUE_COUNT = 6;
// Manual snapshots are sparse; show where the real points are until the line gets dense.
const CHART_MIN_SYMBOL_GAP_PX = 16;
const CHART_MARKER_COLLISION_PX = 64;
const CHART_GRID_TOP = 46;
const CHART_GRID_BOTTOM = 64;
const CHART_FLOOR_LABEL_CLEARANCE_PX = 20;
const CHART_NARROW_WIDTH = 520;

export function renderPeriodSwitch() {
    const wrap = document.getElementById('periodSwitch');
    if (!wrap) return;
    wrap.innerHTML = PERIODS.map(([key]) => {
        const active = state.selectedPeriod === key && !customZoomWindow;
        return `
            <button class="period-chip${active ? ' active' : ''}" type="button" data-period="${key}" aria-pressed="${active}">${periodLabel(key)}</button>
        `;
    }).join('');
    renderChartRangeNote();
}

export function bindPeriodSwitch(onChange) {
    const wrap = document.getElementById('periodSwitch');
    if (!wrap) return;
    wrap.addEventListener('click', event => {
        const chip = event.target.closest('[data-period]');
        if (!chip) return;
        customZoomWindow = null;
        onChange(chip.dataset.period);
    });
    document.getElementById('chartRangeReset')?.addEventListener('click', () => {
        customZoomWindow = null;
        onChange(state.selectedPeriod);
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
        renderChartHints();
        return;
    }

    if (validMetrics.length === 0) {
        messageEl.textContent = t('chartEmpty');
        messageEl.classList.remove('error');
        disposeChart();
        chartEl.innerHTML = '';
        customZoomWindow = null;
        renderChartHints();
        renderPeriodSwitch();
        return;
    }

    messageEl.textContent = '';
    messageEl.classList.remove('error');
    // Reuse the instance so unrelated re-renders (privacy toggle, edits, theme) update in place instead of flashing.
    if (!chartInstance || chartInstance.isDisposed() || chartInstance.getDom() !== chartEl) {
        disposeChart();
        chartInstance = window.echarts.init(chartEl);
        bindChartEvents();
        bindWheelPassthrough(chartEl);
    }

    // Color slots follow the account's position in the full list, so accounts keep their color as others become valid.
    const slotById = new Map(metrics.map((metric, index) => [metric.account.id, index]));
    const customZoom = customZoomWindow ? buildZoomRangeFromWindow(validMetrics, customZoomWindow) : null;
    if (customZoom) customZoomWindow = customZoom.window;
    else customZoomWindow = null;
    chartContext = {
        metrics: validMetrics,
        slotById,
        isCustomRange: Boolean(customZoom),
        zoomRange: customZoom?.range || buildPerformanceZoomRange(validMetrics)
    };

    const chartParts = buildPerformanceChartParts(chartContext);
    rebasingChart = true;
    try {
        chartInstance.setOption(buildChartOption(chartParts), { replaceMerge: ['series'] });
    } finally {
        rebasingChart = false;
    }
    renderChartHints(chartParts);
    renderPeriodSwitch();
}

export function resizeChart() {
    if (!chartInstance || chartInstance.isDisposed()) return;
    chartInstance.resize();
    // Snapshot density and marker placement depend on plot width, so rebuild series after the size changes.
    if (!chartContext) return;
    const chartParts = buildPerformanceChartParts(chartContext);
    chartInstance.setOption({ xAxis: chartParts.xAxisDensity, yAxis: chartParts.yAxisBounds, series: chartParts.series }, false);
    renderChartHints(chartParts);
}

// ECharts' inside dataZoom swallows every wheel event over the plot, even when zoomOnMouseWheel is 'ctrl'.
// Stop plain wheel events before they reach ECharts so the page keeps scrolling; Ctrl + wheel still zooms.
function bindWheelPassthrough(chartEl) {
    if (chartEl.dataset.wheelPassthrough) return;
    chartEl.dataset.wheelPassthrough = 'true';
    chartEl.addEventListener('wheel', event => {
        if (!event.ctrlKey) event.stopPropagation();
    }, { capture: true, passive: true });
}

function disposeChart() {
    if (chartInstance && !chartInstance.isDisposed()) chartInstance.dispose();
    chartInstance = null;
}

function getCssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function getChartTheme() {
    return {
        text: getCssVar('--text-color') || '#2b3150',
        muted: getCssVar('--muted-text') || '#6a7190',
        border: getCssVar('--border-color') || '#dce2f3',
        borderStrong: getCssVar('--border-strong') || '#b6bfd8',
        surface: getCssVar('--surface-color') || '#ffffff',
        elevated: getCssVar('--surface-elevated') || '#ffffff',
        primary: getCssVar('--primary-color') || '#4f46e5',
        primarySoft: getCssVar('--primary-soft') || 'rgba(79, 70, 229, 0.11)',
        positive: getCssVar('--positive-color') || '#ef4444',
        negative: getCssVar('--negative-color') || '#059669',
        series: Array.from({ length: CHART_SERIES_HUE_COUNT }, (_, index) => getCssVar(`--chart-series-${index + 1}`) || '#2a78d6')
    };
}

function buildChartOption(chartParts) {
    const theme = getChartTheme();
    const coarsePointer = window.matchMedia?.('(pointer: coarse)')?.matches === true;
    return {
        aria: {
            enabled: true,
            label: { description: chartParts.ariaDescription }
        },
        tooltip: {
            trigger: 'axis',
            triggerOn: coarsePointer ? 'click' : 'mousemove|click',
            alwaysShowContent: coarsePointer,
            enterable: true,
            hideDelay: coarsePointer ? 0 : 120,
            confine: true,
            backgroundColor: theme.elevated,
            borderColor: theme.border,
            textStyle: { color: theme.text },
            extraCssText: 'box-shadow: 0 10px 28px -16px rgb(15 23 42 / 0.45);',
            axisPointer: {
                type: 'line',
                lineStyle: { color: theme.borderStrong, type: 'dashed' }
            },
            formatter: formatChartTooltip
        },
        legend: {
            type: 'scroll',
            top: 0,
            data: chartParts.accountSeries.map(item => item.name),
            selected: Object.fromEntries(chartParts.accountSeries.map(item => [item.name, legendSelected[item.name] !== false])),
            textStyle: { color: theme.text },
            pageIconColor: theme.primary,
            pageIconInactiveColor: theme.borderStrong,
            pageTextStyle: { color: theme.muted }
        },
        grid: { top: CHART_GRID_TOP, right: CHART_GRID_RIGHT, bottom: CHART_GRID_BOTTOM, left: CHART_GRID_LEFT },
        xAxis: {
            type: 'time',
            boundaryGap: false,
            ...chartParts.xAxisDensity,
            axisLine: { lineStyle: { color: theme.border } },
            axisTick: { lineStyle: { color: theme.border } },
            axisLabel: { color: theme.muted, hideOverlap: true },
            splitLine: { show: false }
        },
        yAxis: {
            type: 'value',
            ...chartParts.yAxisBounds,
            axisLabel: { color: theme.muted, formatter: value => formatChartAxisPercent(value) },
            splitLine: { lineStyle: { color: theme.border } }
        },
        dataZoom: [
            {
                id: 'performance-inside-zoom',
                type: 'inside',
                xAxisIndex: 0,
                filterMode: 'none',
                throttle: 60,
                // Plain wheel scrolls the page; Ctrl + wheel, pinch, and drag still zoom or pan the chart.
                zoomOnMouseWheel: 'ctrl',
                moveOnMouseWheel: false,
                moveOnMouseMove: true,
                ...chartContext.zoomRange
            },
            {
                id: 'performance-slider-zoom',
                type: 'slider',
                xAxisIndex: 0,
                filterMode: 'none',
                ...chartContext.zoomRange,
                height: 26,
                bottom: 16,
                borderColor: theme.border,
                backgroundColor: theme.surface,
                fillerColor: theme.primarySoft,
                dataBackground: {
                    lineStyle: { color: theme.muted, opacity: 0.5 },
                    areaStyle: { color: withAlpha(theme.muted, 0.12) }
                },
                handleStyle: { color: theme.primary },
                labelFormatter: value => formatTooltipDate(value),
                textStyle: { color: theme.muted }
            }
        ],
        series: chartParts.series
    };
}

function buildReturnSeries(points, baseUnitNav, accountName) {
    if (!Number.isFinite(baseUnitNav) || baseUnitNav <= 0) return [];
    return points.map(point => ({
        value: [point.date, (point.unitNav / baseUnitNav - 1) * 100],
        accountName
    }));
}

function getMetricBasePoint(metric, context, zoomBounds) {
    if (context.isCustomRange && zoomBounds) {
        return findPerformanceAnchorPoint(metric.points || metric.periodPoints, zoomBounds.startTime);
    }
    // Preset periods use exactly the same anchor as the overview cards and comparison table.
    return metric.periodPoints[0];
}

function getSeriesStyle(slot, theme) {
    const index = Math.max(0, slot);
    return {
        color: theme.series[index % CHART_SERIES_HUE_COUNT],
        type: index >= CHART_SERIES_HUE_COUNT ? 'dotted' : 'solid'
    };
}

// Markers are attached later in buildPerformanceChartParts, once the y-axis bounds are known.
function buildAccountChartSeries(context, markerAccountId, focusAccountId, zoomBounds, theme) {
    const { metrics, slotById } = context;
    return metrics.map(metric => {
        const focused = focusAccountId === metric.account.id;
        const dimmed = Boolean(focusAccountId) && !focused;
        const showReturnMarkers = metrics.length === 1 || markerAccountId === metric.account.id;
        const style = getSeriesStyle(slotById?.get(metric.account.id) ?? 0, theme);
        const points = metric.points || metric.periodPoints;
        const basePoint = getMetricBasePoint(metric, context, zoomBounds);
        const baseUnitNav = basePoint?.unitNav;
        const data = buildReturnSeries(points, baseUnitNav, metric.account.name)
            .map(point => ({ ...point, accountId: metric.account.id }));
        const visibleData = filterPerformanceSeriesByZoom(data, zoomBounds);
        const hasTrend = visibleData.length >= 2;
        const showSnapshotSymbols = shouldShowSnapshotSymbols(visibleData, zoomBounds, metrics);
        const opacity = dimmed ? 0.28 : 1;

        return {
            id: `account:${metric.account.id}`,
            name: metric.account.name,
            type: 'line',
            showSymbol: showSnapshotSymbols || visibleData.length === 1,
            symbol: 'circle',
            symbolSize: focused ? 5 : 4,
            smooth: false,
            z: 3,
            emphasis: { focus: 'none' },
            // Selection keeps the account's own color; only weight and the other lines' opacity change.
            lineStyle: {
                width: focused ? CHART_FOCUSED_LINE_WIDTH : CHART_LINE_WIDTH,
                color: style.color,
                type: style.type,
                opacity: hasTrend ? opacity : 0
            },
            itemStyle: { color: style.color, borderColor: theme.surface, borderWidth: 1, opacity: Math.min(opacity, 0.72) },
            data,
            markPoint: {
                symbol: 'circle',
                symbolSize: focused ? 10 : 8,
                itemStyle: { color: style.color, borderColor: theme.surface, borderWidth: 2 },
                label: {
                    formatter: params => formatPercent(Number(params.value), 2),
                    color: theme.text,
                    fontSize: 11,
                    fontWeight: 700,
                    textBorderColor: theme.surface,
                    textBorderWidth: 3
                },
                data: []
            },
            markerInput: showReturnMarkers ? visibleData : null,
            visiblePointCount: visibleData.length
        };
    });
}

function shouldShowSnapshotSymbols(visibleData, zoomBounds, metrics) {
    if (!Array.isArray(visibleData) || visibleData.length < 2) return false;
    const pxPerMs = getPlotPxPerMs(metrics, zoomBounds);
    if (!pxPerMs) return false;
    let minimumGap = Infinity;
    let previousTime = null;
    visibleData.forEach(point => {
        const time = parseDate(point?.value?.[0])?.getTime();
        if (!Number.isFinite(time)) return;
        if (previousTime !== null) minimumGap = Math.min(minimumGap, (time - previousTime) * pxPerMs);
        previousTime = time;
    });
    return minimumGap >= CHART_MIN_SYMBOL_GAP_PX;
}

function buildReturnMarkPoints(visibleData, pxPerMs, yAxisBounds, theme) {
    const lowPoint = getLowestSeriesPoint(visibleData);
    const highPoint = getHighestSeriesPoint(visibleData);
    const lastPoint = getLastSeriesPoint(visibleData);
    const markPointData = [];
    const lastTime = lastPoint ? parseDate(lastPoint[0])?.getTime() : NaN;
    const isNearLast = point => {
        const time = parseDate(point[0])?.getTime();
        return Number.isFinite(time) && Number.isFinite(lastTime) && Math.abs(lastTime - time) * pxPerMs < CHART_MARKER_COLLISION_PX;
    };

    if (lowPoint && (!lastPoint || lowPoint[1] !== lastPoint[1])) {
        markPointData.push({
            name: 'Low',
            coord: lowPoint,
            value: lowPoint[1],
            // A low point sitting on the axis floor would push its label into the date labels; put it beside the point.
            label: { position: isNearAxisFloor(lowPoint[1], yAxisBounds) ? 'right' : 'bottom' }
        });
    }

    if (highPoint && (!lastPoint || highPoint[1] !== lastPoint[1])) {
        markPointData.push({
            name: 'High',
            coord: highPoint,
            value: highPoint[1],
            // High and latest both sit above their points; move high aside when they are close enough to overlap.
            label: { position: lastPoint && isNearLast(highPoint) ? 'left' : 'top' }
        });
    }

    if (lastPoint) {
        markPointData.push({
            name: 'Latest',
            coord: lastPoint,
            value: lastPoint[1],
            label: {
                position: 'top',
                color: lastPoint[1] > 0 ? theme.positive : lastPoint[1] < 0 ? theme.negative : theme.text
            }
        });
    }

    return markPointData;
}

function isNearAxisFloor(value, yAxisBounds) {
    const span = yAxisBounds.max - yAxisBounds.min;
    if (!Number.isFinite(span) || span <= 0) return false;
    const plotHeight = Math.max(120, (chartInstance?.getHeight() || 430) - CHART_GRID_TOP - CHART_GRID_BOTTOM);
    return (value - yAxisBounds.min) / span * plotHeight < CHART_FLOOR_LABEL_CLEARANCE_PX;
}

function getPlotPxPerMs(metrics, zoomBounds) {
    const plotWidth = Math.max(200, (chartInstance?.getWidth() || 800) - CHART_GRID_HORIZONTAL_PADDING);
    const extent = zoomBounds || getPerformanceTimeExtent(metrics);
    const span = extent ? extent.endTime - extent.startTime : 0;
    return span > 0 ? plotWidth / span : 0;
}

function getLowestSeriesPoint(data) {
    return (data || []).reduce((lowest, point) => {
        const value = Number(point?.value?.[1]);
        if (!Number.isFinite(value)) return lowest;
        if (!lowest || value < lowest[1]) return [point.value[0], value];
        return lowest;
    }, null);
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

function buildBenchmarkSeries(metrics, zoomBounds, theme) {
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
        id: BENCHMARK_SERIES_ID,
        name: t('annualizedBenchmark10'),
        type: 'line',
        showSymbol: false,
        smooth: false,
        silent: true,
        emphasis: { disabled: true },
        lineStyle: {
            color: theme.muted,
            type: 'dashed',
            width: CHART_BENCHMARK_LINE_WIDTH,
            opacity: 0.58
        },
        // The benchmark stays out of the legend and tooltip, so name it at the line's end instead.
        endLabel: {
            show: true,
            formatter: () => t('benchmarkShort'),
            color: theme.muted,
            fontSize: 10,
            fontWeight: 700,
            distance: 4
        },
        data
    };
}

function bindChartEvents() {
    const updateMarkerFocus = (markerAccountId, focusAccountId = markerAccountId) => {
        if (!chartContext) return;
        const focusedParts = buildPerformanceChartParts(chartContext, markerAccountId, focusAccountId);
        chartInstance.setOption({
            series: focusedParts.series
        }, false);
    };

    chartInstance.on('mouseover', params => {
        if (params.componentType !== 'legend') return;
        const metric = findMetricBySeriesName(chartContext?.metrics, params.name);
        if (!metric) return;
        updateMarkerFocus(metric.account.id, metric.account.id);
    });

    chartInstance.on('mouseout', params => {
        if (params.componentType !== 'legend') return;
        updateMarkerFocus(state.selectedHighlightAccountId, state.selectedHighlightAccountId);
    });

    chartInstance.on('highlight', params => {
        const seriesName = params.batch?.[0]?.seriesName || params.seriesName;
        const metric = findMetricBySeriesName(chartContext?.metrics, seriesName);
        if (!metric) return;
        updateMarkerFocus(metric.account.id, metric.account.id);
    });

    chartInstance.on('downplay', () => {
        updateMarkerFocus(state.selectedHighlightAccountId, state.selectedHighlightAccountId);
    });

    ['legendselectchanged', 'legendselected', 'legendunselected', 'legendselectall', 'legendinverseselect'].forEach(eventName => {
        chartInstance.on(eventName, params => {
            legendSelected = { ...legendSelected, ...params.selected };
            rebaseChart();
        });
    });

    chartInstance.on('datazoom', () => {
        if (!chartInstance || !chartContext || rebasingChart) return;

        const option = chartInstance.getOption();
        const zoom = Array.isArray(option.dataZoom) ? option.dataZoom[0] : null;
        chartContext.zoomRange = {
            start: Number.isFinite(zoom?.start) ? zoom.start : 0,
            end: Number.isFinite(zoom?.end) ? zoom.end : 100
        };
        chartContext.isCustomRange = true;
        customZoomWindow = getPerformanceZoomBounds(chartContext.metrics, chartContext.zoomRange);
        rebaseChart();
        renderPeriodSwitch();
    });
}

function rebaseChart() {
    if (!chartInstance || !chartContext) return;
    const chartParts = buildPerformanceChartParts(chartContext);
    rebasingChart = true;
    try {
        chartInstance.setOption({
            aria: { label: { description: chartParts.ariaDescription } },
            yAxis: chartParts.yAxisBounds,
            series: chartParts.series
        }, false);
    } finally {
        rebasingChart = false;
    }
    renderChartHints(chartParts);
}

function renderChartHints(chartParts = null) {
    const wrap = document.getElementById('chartHints');
    const scale = document.getElementById('chartScaleHint');
    const sparse = document.getElementById('chartSparseHint');
    if (!wrap || !scale || !sparse) return;
    const showScale = Boolean(chartParts?.isVisibleRangeScaled);
    const showSparse = Boolean(chartParts?.hasSparseSeries);
    scale.hidden = !showScale;
    sparse.hidden = !showSparse;
    const scaleText = t('chartAxisScaled');
    const sparseText = t('chartSparsePoints');
    if (showScale && scale.textContent !== scaleText) scale.textContent = scaleText;
    if (showSparse && sparse.textContent !== sparseText) sparse.textContent = sparseText;
    wrap.hidden = !showScale && !showSparse;
}

function renderChartRangeNote() {
    const note = document.getElementById('chartRangeNote');
    if (!note) return;
    const hasChart = Boolean(chartInstance && !chartInstance.isDisposed());
    note.hidden = !customZoomWindow || !hasChart;
    if (note.hidden) return;

    const period = periodLabel(state.selectedPeriod);
    const text = document.getElementById('chartRangeText');
    const reset = document.getElementById('chartRangeReset');
    if (text) {
        text.textContent = t('chartCustomRange', {
            start: formatTooltipDate(customZoomWindow.startTime),
            end: formatTooltipDate(customZoomWindow.endTime)
        });
        text.title = t('chartCustomRangeHint', { period });
    }
    if (reset) reset.textContent = t('chartResetRange', { period });
}

function getPerformanceTimeExtent(metrics) {
    const times = (metrics || [])
        .flatMap(metric => (metric.points || metric.periodPoints).map(point => parseDate(point.date)?.getTime()))
        .filter(time => Number.isFinite(time))
        .sort((a, b) => a - b);
    const startTime = times[0];
    const endTime = times[times.length - 1];
    if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || startTime >= endTime) return null;
    return { startTime, endTime };
}

function getPerformanceZoomBounds(metrics, zoomRange) {
    if (!zoomRange) return null;

    const extent = getPerformanceTimeExtent(metrics);
    if (!extent) return null;

    const start = Number.isFinite(zoomRange.start) ? Math.max(0, Math.min(100, zoomRange.start)) : 0;
    const end = Number.isFinite(zoomRange.end) ? Math.max(0, Math.min(100, zoomRange.end)) : 100;
    const span = extent.endTime - extent.startTime;
    return {
        startTime: extent.startTime + span * start / 100,
        endTime: extent.startTime + span * end / 100
    };
}

function buildZoomRangeFromWindow(metrics, zoomWindow) {
    const extent = getPerformanceTimeExtent(metrics);
    if (!extent || !Number.isFinite(zoomWindow?.startTime) || !Number.isFinite(zoomWindow?.endTime)) return null;

    const startTime = Math.max(extent.startTime, zoomWindow.startTime);
    const endTime = Math.min(extent.endTime, zoomWindow.endTime);
    if (endTime <= startTime) return null;
    const span = extent.endTime - extent.startTime;
    return {
        range: {
            start: (startTime - extent.startTime) / span * 100,
            end: (endTime - extent.startTime) / span * 100
        },
        window: { startTime, endTime }
    };
}

function buildPerformanceZoomRange(metrics) {
    const extent = getPerformanceTimeExtent(metrics);
    if (!extent) return {};
    const { startTime: firstTime, endTime: lastTime } = extent;

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

function findPerformanceAnchorPoint(points, startTime) {
    let firstPoint = null;
    let anchor = null;
    for (const point of points || []) {
        const time = parseDate(point.date)?.getTime();
        if (!Number.isFinite(time)) continue;
        if (!firstPoint) firstPoint = point;
        if (time <= startTime) {
            anchor = point;
            continue;
        }
        break;
    }
    return anchor || firstPoint;
}

function filterPerformanceSeriesByZoom(data, zoomBounds) {
    if (!zoomBounds) return data;

    return (data || []).filter(point => isPointInZoom(point, zoomBounds));
}

function buildYAxisBounds(seriesList, zoomBounds) {
    const values = seriesList
        .flatMap(item => item.data || [])
        .filter(point => isPointInZoom(point, zoomBounds))
        .map(point => Number(point?.value?.[1]))
        .filter(value => Number.isFinite(value));

    if (values.length === 0) return {};

    return calculateYAxisBounds(values);
}

function calculateYAxisBounds(values) {
    values.push(0);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min;
    const interval = getChartYAxisInterval(span / CHART_Y_AXIS_TARGET_SPLITS);
    const axisMin = span > 0 ? Math.floor(min / interval) * interval : min - interval;
    const axisMax = span > 0 ? Math.ceil(max / interval) * interval : max + interval;

    // Keep tick origins aligned while reserving a full label-safe interval at both plot edges.
    const paddedMin = axisMin - interval;
    const paddedMax = (axisMax > axisMin ? axisMax : axisMin + interval) + interval;
    return {
        min: Number(paddedMin.toPrecision(10)),
        max: Number(paddedMax.toPrecision(10)),
        interval
    };
}

// Round the tick step up to a 1-2-5 sequence (0.2%, 0.5%, 1%, 2%, 5%, 10%...) so axis labels stay readable.
function getChartYAxisInterval(rawInterval) {
    if (!Number.isFinite(rawInterval) || rawInterval <= 0.2) return 0.2;
    const magnitude = 10 ** Math.floor(Math.log10(rawInterval));
    const normalized = rawInterval / magnitude;
    const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
    return Number((step * magnitude).toPrecision(6));
}

function isPointInZoom(point, zoomBounds) {
    if (!zoomBounds) return true;
    const time = parseDate(point?.value?.[0])?.getTime();
    return Number.isFinite(time) && time >= zoomBounds.startTime && time <= zoomBounds.endTime;
}

function isAccountVisible(metric) {
    return legendSelected[metric.account.name] !== false;
}

function buildPerformanceChartParts(context, markerAccountId = state.selectedHighlightAccountId, focusAccountId = state.selectedHighlightAccountId) {
    const theme = getChartTheme();
    const zoomBounds = getPerformanceZoomBounds(context.metrics, context.zoomRange);
    const accountSeries = buildAccountChartSeries(context, markerAccountId, focusAccountId, zoomBounds, theme);
    const benchmarkSeries = buildBenchmarkSeries(context.metrics, zoomBounds, theme);
    const visibleAccountSeries = accountSeries.filter((_, index) => isAccountVisible(context.metrics[index]));
    const hasSparseSeries = visibleAccountSeries.some(series => series.visiblePointCount < 2);
    const selectedMetric = context.metrics.find(metric => metric.account.id === state.selectedHighlightAccountId);
    const maxDrawdownMetric = selectedMetric || (context.metrics.length === 1 ? context.metrics[0] : null);
    const zeroLineSeries = buildZeroLineSeries(benchmarkSeries.data, theme);
    const yAxisBounds = buildYAxisBounds([...visibleAccountSeries, benchmarkSeries], zoomBounds);
    const pxPerMs = getPlotPxPerMs(context.metrics, zoomBounds);
    accountSeries.forEach(series => {
        if (series.markerInput) series.markPoint.data = buildReturnMarkPoints(series.markerInput, pxPerMs, yAxisBounds, theme);
        delete series.markerInput;
        delete series.visiblePointCount;
    });
    const maxDrawdownSeries = (maxDrawdownMetric && isAccountVisible(maxDrawdownMetric)
        && buildAccountMaxDrawdownSeries(maxDrawdownMetric, context, zoomBounds, theme))
        || buildEmptyMaxDrawdownSeries();
    const extent = getPerformanceTimeExtent(context.metrics);
    const isVisibleRangeScaled = Boolean(extent && zoomBounds
        && (zoomBounds.startTime > extent.startTime + DAY_MS || zoomBounds.endTime < extent.endTime - DAY_MS));
    return {
        accountSeries,
        yAxisBounds,
        hasSparseSeries,
        isVisibleRangeScaled,
        // Fewer date ticks on phones so day labels do not run together.
        xAxisDensity: (chartInstance?.getWidth() || 800) < CHART_NARROW_WIDTH ? { splitNumber: 4 } : { splitNumber: 8 },
        ariaDescription: buildChartAriaDescription(context.metrics, visibleAccountSeries, zoomBounds),
        series: [...accountSeries, benchmarkSeries, zeroLineSeries, maxDrawdownSeries]
    };
}

function buildChartAriaDescription(metrics, visibleAccountSeries, zoomBounds) {
    const extent = zoomBounds || getPerformanceTimeExtent(metrics);
    const accounts = visibleAccountSeries
        .map(series => {
            const lastPoint = getLastSeriesPoint(filterPerformanceSeriesByZoom(series.data, zoomBounds));
            return lastPoint ? t('chartAriaAccount', { name: series.name, value: formatPercent(lastPoint[1], 2) }) : '';
        })
        .filter(Boolean)
        .join('; ');
    return t('chartAriaSummary', {
        start: formatTooltipDate(extent?.startTime),
        end: formatTooltipDate(extent?.endTime),
        accounts
    });
}

function findMetricBySeriesName(metrics, seriesName) {
    return (metrics || []).find(metric => metric.account.name === seriesName);
}

function buildZeroLineSeries(data, theme) {
    return {
        id: ZERO_LINE_SERIES_ID,
        name: ZERO_LINE_SERIES_ID,
        type: 'line',
        data,
        showSymbol: false,
        silent: true,
        tooltip: { show: false },
        lineStyle: { opacity: 0 },
        itemStyle: { opacity: 0 },
        // Solid and thin, so it reads differently from the dashed benchmark.
        markLine: {
            symbol: 'none',
            silent: true,
            label: { show: false },
            lineStyle: { color: theme.borderStrong, type: 'solid', width: 1 },
            data: [{ yAxis: 0 }]
        },
        emphasis: { disabled: true },
        z: 0
    };
}

// Always emit the drawdown series so merge-mode updates (zoom, hover) replace a previous fill instead of leaving it behind.
function buildEmptyMaxDrawdownSeries() {
    return {
        id: MAX_DRAWDOWN_SERIES_NAME,
        name: MAX_DRAWDOWN_SERIES_NAME,
        type: 'line',
        data: [],
        silent: true,
        tooltip: { show: false },
        markPoint: { data: [] },
        markArea: { data: [] }
    };
}

function buildAccountMaxDrawdownSeries(metric, context, zoomBounds = null, theme = getChartTheme()) {
    const points = metric.points || metric.periodPoints;
    const basePoint = getMetricBasePoint(metric, context, zoomBounds);
    const baseUnitNav = basePoint?.unitNav;
    if (!Number.isFinite(baseUnitNav) || baseUnitNav <= 0) return null;

    const data = points.map(point => ({
        value: [point.date, (point.unitNav / baseUnitNav - 1) * 100],
        accountName: metric.account.name
    }));
    const visibleData = filterPerformanceSeriesByZoom(data, zoomBounds);
    const segmentData = getMaxDrawdownSegment(visibleData);
    if (segmentData.length < 2) return null;

    const peakValue = 1 + Number(segmentData[0].value[1]) / 100;
    const troughValue = 1 + Number(segmentData[segmentData.length - 1].value[1]) / 100;
    const maxDrawdown = (troughValue / peakValue - 1) * 100;
    const peakPoint = segmentData[0];
    const troughPoint = segmentData[segmentData.length - 1];
    const labelText = `${t('maxDrawdown')} ${formatPercent(maxDrawdown, 2)}`;

    const drawdownColor = theme.negative;
    return {
        id: MAX_DRAWDOWN_SERIES_NAME,
        name: MAX_DRAWDOWN_SERIES_NAME,
        type: 'line',
        data: segmentData,
        showSymbol: false,
        smooth: false,
        silent: true,
        tooltip: { show: false },
        lineStyle: { opacity: 0 },
        itemStyle: { color: drawdownColor },
        // A light time band communicates the drawdown event without looking like negative area under the return line.
        markArea: {
            silent: true,
            label: { show: false },
            itemStyle: { color: withAlpha(drawdownColor, 0.08) },
            data: [[
                { xAxis: peakPoint.value[0] },
                { xAxis: troughPoint.value[0] }
            ]]
        },
        emphasis: { disabled: true },
        markPoint: {
            animation: false,
            silent: true,
            data: [{
                name: t('drawdownPeak'),
                coord: peakPoint.value,
                value: peakPoint.value[1],
                symbol: 'circle',
                symbolSize: 7,
                itemStyle: { color: theme.surface, borderColor: drawdownColor, borderWidth: 2 },
                label: {
                    show: true,
                    position: 'top',
                    distance: 5,
                    formatter: () => t('drawdownPeak'),
                    color: theme.muted,
                    fontSize: 11,
                    fontWeight: 700,
                    backgroundColor: withAlpha(theme.surface, 0.9),
                    padding: [2, 5],
                    borderRadius: 3
                }
            }, {
                name: t('drawdownTrough'),
                coord: troughPoint.value,
                value: troughPoint.value[1],
                symbol: 'circle',
                symbolSize: 7,
                itemStyle: { color: drawdownColor, borderColor: theme.surface, borderWidth: 2 },
                label: {
                    show: true,
                    position: 'bottom',
                    distance: 5,
                    formatter: () => `${t('drawdownTrough')} · ${labelText}`,
                    color: drawdownColor,
                    fontSize: 11,
                    fontWeight: 700,
                    backgroundColor: withAlpha(theme.surface, 0.9),
                    padding: [2, 5],
                    borderRadius: 3
                }
            }]
        },
        z: 2
    };
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
        .filter(item => item.seriesName !== t('annualizedBenchmark10'))
        .sort((left, right) => {
            const leftSelected = left.data?.accountId === state.selectedHighlightAccountId ? 1 : 0;
            const rightSelected = right.data?.accountId === state.selectedHighlightAccountId ? 1 : 0;
            if (leftSelected !== rightSelected) return rightSelected - leftSelected;
            const leftValue = Number(Array.isArray(left.value) ? left.value[1] : left.value);
            const rightValue = Number(Array.isArray(right.value) ? right.value[1] : right.value);
            return (Number.isFinite(rightValue) ? rightValue : -Infinity) - (Number.isFinite(leftValue) ? leftValue : -Infinity);
        });
    if (items.length === 0) return '';

    const title = formatTooltipDate(items[0].axisValue ?? items[0].axisValueLabel ?? items[0].value?.[0] ?? '');
    const rows = items.map(item => {
        const value = Array.isArray(item.value) ? item.value[1] : item.value;
        // Snapshots are recorded on different days per account; flag rows whose nearest point is not the title date.
        const rowDate = formatTooltipDate(Array.isArray(item.value) ? item.value[0] : '');
        const dateNote = rowDate && rowDate !== title
            ? `<span style="margin-left:4px;opacity:0.62;font-size:11px;font-variant-numeric:tabular-nums;">${rowDate}</span>`
            : '';
        const selected = item.data?.accountId === state.selectedHighlightAccountId;
        return `
            <div style="display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:6px;align-items:center;min-width:180px;line-height:1.35;">
                <span>${item.marker || ''}</span>
                <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;${selected ? 'font-weight:800;' : ''}">${escapeHtml(item.data?.accountName || item.seriesName)}${dateNote}</span>
                <span style="font-variant-numeric:tabular-nums;text-align:right;${selected ? 'font-weight:800;' : ''}">${formatPercent(Number(value))}</span>
            </div>
        `;
    }).join('');

    return `<div style="font-weight:700;margin-bottom:4px;line-height:1.25;">${title}</div>${rows}`;
}

function formatTooltipDate(value) {
    if (value === '' || value === null || value === undefined) return '';
    if (typeof value === 'string') return value.split(/[ T]/)[0];

    const parsed = value instanceof Date ? value : new Date(value);
    if (!Number.isFinite(parsed.getTime())) return String(value);
    return parsed.toLocaleDateString('sv-SE');
}

function parseDate(date) {
    const parsed = new Date(`${date}T00:00:00`);
    return Number.isFinite(parsed.getTime()) ? parsed : null;
}
