const vscode = acquireVsCodeApi();
const PERIODS = {
  ytd: '今年',
  m1: '近1月',
  m3: '近3月',
  m6: '近6月',
  y1: '近1年',
  y3: '近3年',
  y5: '近5年'
};
const DETAIL_PERIODS = ['ytd', 'm1', 'm3', 'm6', 'y1', 'y3', 'y5'];
const ANNUAL_BENCHMARK = 10;
const NAV_LIST_PAGE_SIZE = 20;
const CHART_Y_AXIS_TARGET_SPLITS = 5;
const DAY_MS = 24 * 60 * 60 * 1000;
const SERIES_HUE_COUNT = 5;
const BENCHMARK_NAME = `年化${ANNUAL_BENCHMARK}%`;
const DRAWDOWN_NAME = '最大回撤';
const BASELINE_NAME = '__baseline';
const TOOLTIP_MATCH_TOLERANCE_MS = 5 * DAY_MS;
const ZOOM_MATCH_TOLERANCE_MS = DAY_MS;
const PRESET_CLAMP_TOLERANCE_MS = 7 * DAY_MS;
const LATE_START_TOLERANCE_MS = 7 * DAY_MS;
// High/low within this many percentage points of the latest value count as the same point.
const MARK_SAME_VALUE_TOLERANCE = 0.1;
const LEGEND_EVENTS = ['legendselectchanged', 'legendselected', 'legendunselected', 'legendselectall', 'legendinverseselect'];
let currentPayload = null;
let currentTargetKey = null;
let currentPeriod = document.querySelector('#periodTabs button.active')?.dataset.period || 'm3';
let currentViewMode = document.querySelector('input[name="trendView"]:checked')?.value || 'list';
let currentListPage = 1;
let annualCompareMetric = 'returnValue';
let selectedFundCode = null;
let trendChart = null;
let currentChartContext = null;
let isRebasingChart = false;
let customZoomWindow = null;
let legendSelected = {};
let themeRefreshFrame = 0;
const colorContext = document.createElement('canvas').getContext('2d');

// Pixel-dependent label placement (e.g. the drawdown value) is recomputed after size or theme changes.
function scheduleChartRefresh() {
  cancelAnimationFrame(themeRefreshFrame);
  themeRefreshFrame = requestAnimationFrame(() => applyChartOption());
}

function handleChartResize() {
  trendChart?.resize();
  scheduleChartRefresh();
}

if (typeof ResizeObserver === 'function') {
  new ResizeObserver(handleChartResize).observe(document.getElementById('chart'));
} else {
  window.addEventListener('resize', handleChartResize);
}

const themeObserver = new MutationObserver(scheduleChartRefresh);
themeObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });
themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });

document.getElementById('periodTabs').addEventListener('click', event => {
  const target = event.target;
  if (!(target instanceof HTMLButtonElement)) return;
  const period = target.dataset.period;
  if (!period || !PERIODS[period]) return;
  if (period === currentPeriod && !customZoomWindow) return;
  currentPeriod = period;
  customZoomWindow = null;
  currentListPage = 1;
  renderCurrentTrend();
});

document.getElementById('chartZoomReset').addEventListener('click', () => {
  customZoomWindow = null;
  renderCurrentTrend();
});

document.getElementById('viewTabs').addEventListener('change', event => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement) || target.type !== 'radio') return;
  const view = target.value;
  if (!view || view === currentViewMode) return;
  currentViewMode = view;
  currentListPage = 1;
  renderCurrentTrend();
});

document.getElementById('navList').addEventListener('click', event => {
  const target = event.target;
  if (!(target instanceof HTMLButtonElement)) return;
  const page = Number(target.dataset.page);
  if (!Number.isInteger(page) || page === currentListPage) return;
  currentListPage = page;
  renderCurrentTrend();
});

document.getElementById('navList').addEventListener('submit', event => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement) || !form.classList.contains('pager-jump')) return;
  event.preventDefault();
  const input = form.querySelector('input[name="page"]');
  const pageCount = Number(form.dataset.pageCount);
  const page = input instanceof HTMLInputElement ? Number(input.value) : NaN;
  if (!Number.isInteger(page) || !Number.isInteger(pageCount)) return;
  currentListPage = Math.min(Math.max(page, 1), pageCount);
  renderCurrentTrend();
});

window.addEventListener('message', event => {
  const message = event.data;
  if (message.type === 'trendLoading') {
    document.getElementById('title').textContent = message.title || '基金趋势';
    setStatus('加载历史净值...');
  }
  if (message.type === 'trendData') {
    renderTrend(message.payload);
  }
  if (message.type === 'trendError') {
    setStatus(message.message || '历史趋势加载失败');
    document.getElementById('summary').innerHTML = '';
    document.getElementById('tradingInfo').innerHTML = '';
    disposeChart();
    clearChartMeta();
    document.getElementById('chart').innerHTML = '<div class="card">暂无可展示数据</div>';
    document.getElementById('navList').innerHTML = '';
    document.getElementById('metrics').innerHTML = '';
    document.getElementById('annualCompare').innerHTML = '';
  }
});

function renderTrend(payload) {
  const targetKey = payload?.target?.key ?? null;
  if (targetKey !== currentTargetKey) {
    currentTargetKey = targetKey;
    legendSelected = {};
    customZoomWindow = null;
  }
  currentPayload = payload;
  renderCurrentTrend();
}

function renderCurrentTrend() {
  if (!currentPayload) return;
  const { target, nav, metrics, tradingInfo } = currentPayload;
  document.getElementById('title').textContent = target.title;
  setStatus(nav.failedCodes.length ? `加载失败 ${nav.failedCodes.join(', ')}` : '');
  if (selectedFundCode && !metrics.some(metric => metric.code === selectedFundCode)) selectedFundCode = null;
  if (target.kind !== 'fund') currentViewMode = 'chart';
  updatePeriodTabs();
  updateViewTabs(target.kind === 'fund');
  renderSummary(metrics, currentPeriod);
  renderTradingInfo(tradingInfo, target.kind);
  if (currentViewMode === 'list' && target.kind === 'fund') {
    renderNavList(metrics[0], currentPeriod);
  } else {
    renderChart(metrics, currentPeriod);
  }
  renderMetrics(metrics, currentPeriod);
  renderAnnualCompare(metrics, target.kind);
}

function renderSummary(metrics, period) {
  document.getElementById('summary').innerHTML = '';
}

function renderTradingInfo(info, targetKind) {
  const container = document.getElementById('tradingInfo');
  if (targetKind !== 'fund') {
    container.innerHTML = '';
    return;
  }

  if (!info) {
    container.innerHTML = `<article class="card trading-card">
      <div class="trading-header"><div class="card-title">交易信息</div></div>
      <div class="trading-unavailable">交易信息暂不可用，请以基金公司公告及实际下单页为准。</div>
    </article>`;
    return;
  }

  const fields = [
    ['申购状态', info.purchaseStatus],
    ['赎回状态', info.redemptionStatus],
    ['限额', info.dailyPurchaseLimit]
  ];
  container.innerHTML = `<article class="card trading-card">
    <div class="trading-header">
      <div>
        <div class="card-title">交易信息</div>
        <div class="trading-updated">更新于 ${escapeHtml(formatDateTime(info.updatedAt))}</div>
      </div>
    </div>
    <div class="trading-fields">
      ${fields.map(([label, value]) => `<div class="trading-field">
        <span>${escapeHtml(label)}</span><strong>${escapeHtml(value || '暂无数据')}</strong>
      </div>`).join('')}
    </div>
    <div class="trading-fee-grid">
      ${renderTradingFeeSection('申购费率', info.purchaseFees, '适用金额', '原费率 | 优惠费率')}
      ${renderTradingFeeSection('持有费率', info.holdingFees, '费用项目', '费率')}
      ${renderTradingFeeSection('赎回费率', info.redemptionFees, '持有期限', '费率')}
    </div>
    <div class="trading-note">短期持有可能产生较高赎回费。交易规则可能变化，实际下单页及基金公司公告优先。</div>
  </article>`;
}

function renderTradingFeeSection(title, rows, rangeLabel, rateLabel) {
  const feeRows = Array.isArray(rows) ? rows : [];
  return `<section class="trading-fee-section">
    <div class="fee-title">${escapeHtml(title)}</div>
    ${feeRows.length ? `<div class="fee-table-wrap"><table class="fee-table">
      <thead><tr><th>${escapeHtml(rangeLabel)}</th><th>${escapeHtml(rateLabel)}</th></tr></thead>
      <tbody>${feeRows.map(row => `<tr><td>${escapeHtml(row.range)}</td><td>${escapeHtml(row.rate)}</td></tr>`).join('')}</tbody>
    </table></div>` : `<div class="trading-unavailable">${escapeHtml(title)}暂无数据</div>`}
  </section>`;
}

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(date);
}

function updateViewTabs(visible) {
  const tabs = document.getElementById('viewTabs');
  tabs.hidden = !visible;
  tabs.querySelectorAll('input[type="radio"]').forEach(input => {
    input.checked = input.value === currentViewMode;
  });
}

function renderChart(metrics, period) {
  const chartEl = document.getElementById('chart');
  const listEl = document.getElementById('navList');
  chartEl.hidden = false;
  listEl.hidden = true;
  document.getElementById('chartTitle').textContent = `${PERIODS[period]}收益走势`;
  if (!metrics.length) {
    showChartEmptyState('<div class="card">暂无可展示数据</div>');
    return;
  }

  const visibleMetrics = selectedFundCode ? metrics.filter(metric => metric.code === selectedFundCode) : metrics;
  const series = visibleMetrics
    .map(metric => ({
      metric,
      slot: metrics.indexOf(metric),
      points: metric.chartSeries?.all || metric.chartSeries?.[period] || []
    }))
    .filter(item => item.points.length > 1);
  const extent = getSeriesExtent(series);
  if (!series.length || !extent) {
    showChartEmptyState('<div class="empty-state">当前周期暂无足够历史数据</div>');
    return;
  }

  if (!window.echarts) {
    showChartEmptyState('<div class="empty-state">ECharts 加载失败，无法展示趋势图</div>');
    return;
  }

  if (!trendChart || trendChart.isDisposed()) {
    chartEl.innerHTML = '';
    trendChart = echarts.init(chartEl, null, { renderer: 'canvas' });
  }
  const preset = buildPresetWindow(extent, period, series);
  const zoomWindow = customZoomWindow ? clampWindow(customZoomWindow, extent) : preset.window;
  currentChartContext = { series, period, extent, preset, zoomWindow };
  bindChartEvents();
  applyChartOption();
  trendChart.resize();
}

function showChartEmptyState(html) {
  disposeChart();
  clearChartMeta();
  document.getElementById('chart').innerHTML = html;
}

function disposeChart() {
  if (!trendChart) return;
  trendChart.dispose();
  trendChart = null;
  currentChartContext = null;
}

function applyChartOption() {
  if (!trendChart || trendChart.isDisposed() || !currentChartContext) return;
  isRebasingChart = true;
  trendChart.setOption(buildChartOption(currentChartContext), { replaceMerge: ['series'] });
  isRebasingChart = false;
  updateChartMeta(currentChartContext);
}

function bindChartEvents() {
  if (!trendChart) return;
  trendChart.off('datazoom');
  trendChart.on('datazoom', handleChartZoom);
  LEGEND_EVENTS.forEach(eventName => {
    trendChart.off(eventName);
    trendChart.on(eventName, event => {
      legendSelected = { ...legendSelected, ...event.selected };
      applyChartOption();
    });
  });
}

function handleChartZoom(event) {
  if (!trendChart || !currentChartContext || isRebasingChart) return;
  // The always-visible zero baseline spans the full extent, so axis percentages map onto it exactly.
  const zoom = event?.batch?.[0] ?? event ?? {};
  const { extent, preset, zoomWindow: previousWindow } = currentChartContext;
  const span = extent.endTime - extent.startTime;
  const startTime = Number.isFinite(zoom.startValue)
    ? zoom.startValue
    : Number.isFinite(zoom.start) ? extent.startTime + span * zoom.start / 100 : previousWindow.startTime;
  const endTime = Number.isFinite(zoom.endValue)
    ? zoom.endValue
    : Number.isFinite(zoom.end) ? extent.startTime + span * zoom.end / 100 : previousWindow.endTime;
  const zoomWindow = clampWindow({ startTime, endTime }, extent);
  currentChartContext.zoomWindow = zoomWindow;
  customZoomWindow = isSameWindow(zoomWindow, preset.window) ? null : zoomWindow;
  applyChartOption();
}

function buildChartOption(context) {
  const { series, extent, zoomWindow } = context;
  const theme = getChartTheme();
  const isSingle = series.length === 1;
  const rebasedSeries = rebaseSeriesForZoom(series, zoomWindow);
  const benchmark = buildAnnualBenchmarkSeries(rebasedSeries, zoomWindow.startTime);
  const yAxisBounds = buildYAxisBounds(
    rebasedSeries.filter(item => isSingle || isLegendItemSelected(seriesName(item))),
    isLegendItemSelected(BENCHMARK_NAME) ? benchmark : [],
    zoomWindow,
    isSingle
  );
  const lineWidth = series.length > 4 ? 1.5 : 2;
  const lineSeries = rebasedSeries.map(item => {
    const style = getSeriesStyle(item.slot, theme);
    const data = item.points.map(point => [parseDate(point[0]), point[1], point[0], point[2], point[3], point[4]]);
    const visibleData = filterEchartsSeriesByZoom(data, zoomWindow);
    const markPointData = isSingle
      ? buildReturnMarkPoints(visibleData, zoomWindow, yAxisBounds, style, theme)
      : buildSeriesStartMarkPoints(visibleData, zoomWindow, style, theme);
    return {
      name: seriesName(item),
      type: 'line',
      showSymbol: false,
      smooth: false,
      // The single-fund drawdown area traces the raw points, so keep the line unsampled to match its edge.
      sampling: isSingle ? undefined : 'lttb',
      z: 3,
      emphasis: isSingle ? { focus: 'none' } : { focus: 'series' },
      itemStyle: { color: style.color },
      lineStyle: { width: lineWidth, type: style.type, color: style.color },
      data,
      markPoint: markPointData.length > 0 ? { animation: false, data: markPointData } : undefined
    };
  });
  const drawdown = isSingle ? buildDrawdown(rebasedSeries[0], zoomWindow, yAxisBounds, theme) : null;
  const drawdownSeries = drawdown?.series ?? null;
  const allSeries = [
    ...lineSeries,
    {
      name: BENCHMARK_NAME,
      type: 'line',
      showSymbol: false,
      silent: true,
      z: 2,
      emphasis: { disabled: true },
      blur: { lineStyle: { opacity: 0.5 } },
      itemStyle: { color: theme.benchmark },
      lineStyle: { width: 1.4, type: 'dashed', color: theme.benchmark },
      data: benchmark.map(point => [parseDate(point[0]), point[1], point[0]])
    },
    {
      name: BASELINE_NAME,
      type: 'line',
      showSymbol: false,
      silent: true,
      z: 1,
      tooltip: { show: false },
      emphasis: { disabled: true },
      blur: { lineStyle: { opacity: 1 } },
      lineStyle: { width: 1, color: theme.baseline },
      data: [[extent.startTime, 0], [extent.endTime, 0]]
    }
  ];
  if (drawdownSeries) allSeries.push(drawdownSeries);

  const legendItems = [
    ...(isSingle ? [] : lineSeries.map(item => ({ name: item.name }))),
    { name: BENCHMARK_NAME },
    ...(drawdownSeries ? [{ name: DRAWDOWN_NAME, icon: 'rect', itemStyle: { color: theme.drawdownLegend } }] : [])
  ];
  // Every named series gets an explicit state so stale hidden flags never leak into a single-fund view.
  const legendState = Object.fromEntries(allSeries
    .filter(item => item.name !== BASELINE_NAME)
    .map(item => [item.name, (isSingle && item.name === lineSeries[0].name) || isLegendItemSelected(item.name)]));
  const zoomSpan = zoomWindow.endTime - zoomWindow.startTime;

  return {
    animation: false,
    backgroundColor: 'transparent',
    aria: {
      enabled: true,
      label: { description: buildChartAriaDescription(context, rebasedSeries) }
    },
    textStyle: {
      color: theme.foreground,
      fontFamily: getCssVar('--vscode-font-family', 'sans-serif'),
      fontSize: Number.parseInt(getCssVar('--vscode-font-size', '13'), 10) || 13
    },
    grid: { left: 24, right: 18, top: 48, bottom: 64, containLabel: true },
    legend: {
      type: 'scroll',
      data: legendItems,
      selected: legendState,
      top: 2,
      itemWidth: 16,
      itemHeight: 8,
      formatter: name => (name === DRAWDOWN_NAME && drawdown ? `${DRAWDOWN_NAME} ${formatPercent(drawdown.value)}` : name),
      textStyle: { color: theme.muted },
      pageIconColor: getCssVar('--vscode-button-background', '#0e639c'),
      pageIconInactiveColor: getCssVar('--vscode-disabledForeground', '#666666'),
      pageTextStyle: { color: theme.muted }
    },
    tooltip: {
      trigger: 'axis',
      renderMode: 'html',
      confine: true,
      backgroundColor: getCssVar('--vscode-editorWidget-background', '#252526'),
      borderColor: getCssVar('--vscode-editorWidget-border', '#454545'),
      textStyle: { color: getCssVar('--vscode-editorWidget-foreground', '#cccccc') },
      axisPointer: {
        type: 'line',
        lineStyle: { color: getCssVar('--vscode-focusBorder', '#007fd4'), type: 'dashed' }
      },
      formatter: params => formatChartTooltip(Array.isArray(params) ? params : [params])
    },
    xAxis: {
      type: 'time',
      axisLine: { lineStyle: { color: theme.border } },
      axisTick: { lineStyle: { color: theme.border } },
      axisLabel: {
        color: theme.muted,
        hideOverlap: true,
        alignMinLabel: 'left',
        alignMaxLabel: 'right',
        formatter: value => formatDateTick(value, zoomSpan)
      },
      splitLine: { show: false }
    },
    yAxis: {
      type: 'value',
      position: 'right',
      ...yAxisBounds,
      axisLabel: {
        color: theme.muted,
        formatter: value => formatAxisPercent(value, yAxisBounds.interval)
      },
      splitLine: { lineStyle: { color: theme.grid, type: 'dashed' } }
    },
    dataZoom: [
      {
        type: 'inside',
        throttle: 60,
        startValue: zoomWindow.startTime,
        endValue: zoomWindow.endTime,
        zoomOnMouseWheel: 'ctrl',
        moveOnMouseWheel: false,
        moveOnMouseMove: true
      },
      {
        type: 'slider',
        startValue: zoomWindow.startTime,
        endValue: zoomWindow.endTime,
        height: 26,
        bottom: 16,
        borderColor: theme.border,
        backgroundColor: theme.sliderBackground,
        fillerColor: theme.sliderFiller,
        dataBackground: {
          lineStyle: { color: theme.muted, opacity: 0.6 },
          areaStyle: { color: theme.sliderShadow }
        },
        handleStyle: { color: getCssVar('--vscode-button-background', '#0e639c') },
        labelFormatter: value => formatTimeDate(value),
        textStyle: { color: theme.muted }
      }
    ],
    series: allSeries
  };
}

function getChartTheme() {
  const foreground = getCssVar('--vscode-foreground', '#cccccc');
  const muted = getCssVar('--vscode-descriptionForeground', '#999999');
  const surface = getCssVar('--vscode-editor-background', '#1e1e1e');
  // Same "fall" color as .negative text, so the drawdown reads as a decline under the A-share red-up convention.
  const down = getCssVar('--vscode-charts-green', '#89d185');
  return {
    foreground,
    muted,
    surface,
    border: getCssVar('--trend-border', '#454545'),
    grid: toRgba(muted, 0.22),
    baseline: toRgba(muted, 0.7),
    benchmark: getCssVar('--vscode-charts-yellow', '#cca700'),
    down,
    drawdownFillTop: toRgba(down, 0.32),
    drawdownFillBottom: toRgba(down, 0.03),
    drawdownLegend: toRgba(down, 0.55),
    labelBackground: toRgba(surface, 0.86),
    sliderBackground: toRgba(foreground, 0.04),
    sliderFiller: toRgba(getCssVar('--vscode-button-background', '#0e639c'), 0.18),
    sliderShadow: toRgba(muted, 0.16),
    series: Array.from({ length: SERIES_HUE_COUNT }, (_, index) => getCssVar(`--series-${index + 1}`, '#3987e5'))
  };
}

function getSeriesStyle(slot, theme) {
  const index = Math.max(0, slot);
  return {
    color: theme.series[index % SERIES_HUE_COUNT],
    type: index >= SERIES_HUE_COUNT ? 'dotted' : 'solid'
  };
}

function seriesName(item) {
  return `${item.metric.name} ${item.metric.code}`;
}

function isLegendItemSelected(name) {
  return legendSelected[name] !== false;
}

function buildReturnMarkPoints(visibleData, zoomWindow, yAxisBounds, style, theme) {
  const lowPoint = getLowestSeriesPoint(visibleData);
  const highPoint = getHighestSeriesPoint(visibleData);
  const lastPoint = getLastSeriesPoint(visibleData);
  if (!lastPoint) return [];

  // Returns are floats, so "same as latest" uses a tolerance instead of strict equality.
  const isSameAsLatest = point => Math.abs(point[1] - lastPoint[1]) < MARK_SAME_VALUE_TOLERANCE;
  const markPointData = [];

  // High and low each keep their own label at their own point, unless they are essentially the latest value.
  if (highPoint && !isSameAsLatest(highPoint)) {
    const highMark = buildMarkPoint(highPoint, `最高 ${formatPercent(highPoint[1])}`, 'top', 0, zoomWindow, style, theme);
    highMark.label.distance += getHighLabelLift(highPoint, lastPoint, zoomWindow, yAxisBounds);
    markPointData.push(highMark);
  }

  if (lowPoint && !isSameAsLatest(lowPoint)) {
    markPointData.push(buildMarkPoint(lowPoint, `最低 ${formatPercent(lowPoint[1])}`, 'bottom', 180, zoomWindow, style, theme));
  }

  // "最新" always sits above the curve so it never stacks beside a "最低" label below it.
  markPointData.push({
    ...buildMarkPoint(lastPoint, `最新 ${formatPercent(lastPoint[1])}`, 'top', 0, zoomWindow, style, theme),
    symbol: 'circle',
    symbolSize: 8
  });
  return markPointData;
}

// Both "最高" and "最新" sit above their points; when they are close on screen, lift the high label clear of the latest one.
function getHighLabelLift(highPoint, lastPoint, zoomWindow, yAxisBounds) {
  const labelWidth = 90;
  const labelHeight = 22;
  const plotWidth = Math.max(200, (trendChart?.getWidth() || 800) - 90);
  const plotHeight = Math.max(120, (trendChart?.getHeight() || 420) - 132);
  const dx = Math.abs(highPoint[0] - lastPoint[0]) * plotWidth / Math.max(1, zoomWindow.endTime - zoomWindow.startTime);
  const dy = (highPoint[1] - lastPoint[1]) * plotHeight / Math.max(1e-6, (yAxisBounds.max ?? 0) - (yAxisBounds.min ?? 0));
  return dx < labelWidth && dy < labelHeight ? Math.ceil(labelHeight - dy) : 0;
}

function buildMarkPoint(point, text, position, rotate, zoomWindow, style, theme) {
  return {
    coord: point,
    value: point[1],
    symbol: 'triangle',
    symbolSize: 9,
    symbolRotate: rotate,
    itemStyle: { color: style.color, borderColor: theme.surface, borderWidth: 1.5 },
    label: {
      show: true,
      position,
      distance: 6,
      align: getMarkLabelAlign(point[0], zoomWindow),
      formatter: () => text,
      color: theme.foreground,
      fontSize: 11,
      fontWeight: 600,
      lineHeight: 15,
      backgroundColor: theme.labelBackground,
      padding: [2, 5],
      borderRadius: 3
    }
  };
}

function getMarkLabelAlign(time, zoomWindow) {
  const span = Math.max(1, zoomWindow.endTime - zoomWindow.startTime);
  if (time - zoomWindow.startTime < span * 0.12) return 'left';
  if (zoomWindow.endTime - time < span * 0.12) return 'right';
  return 'center';
}

function buildSeriesStartMarkPoints(visibleData, zoomWindow, style, theme) {
  const firstPoint = visibleData[0];
  if (!firstPoint || firstPoint[0] - zoomWindow.startTime <= LATE_START_TOLERANCE_MS) return [];
  return [{
    coord: [firstPoint[0], firstPoint[1]],
    value: firstPoint[1],
    symbol: 'circle',
    symbolSize: 7,
    itemStyle: { color: theme.surface, borderColor: style.color, borderWidth: 2 },
    label: {
      show: true,
      position: 'top',
      formatter: () => `${formatShortDate(firstPoint[2])}起`,
      color: theme.foreground,
      fontSize: 10,
      backgroundColor: theme.labelBackground,
      padding: [1, 4],
      borderRadius: 3
    }
  }];
}

function filterEchartsSeriesByZoom(data, zoomWindow) {
  if (!zoomWindow) return data || [];
  return (data || []).filter(point => {
    const time = Number(point?.[0]);
    return Number.isFinite(time) && time >= zoomWindow.startTime && time <= zoomWindow.endTime;
  });
}

function getLowestSeriesPoint(data) {
  return (data || []).reduce((lowest, point) => {
    const value = Number(point?.[1]);
    if (!Number.isFinite(value)) return lowest;
    if (!lowest || value < lowest[1]) return [point[0], value];
    return lowest;
  }, null);
}

function getHighestSeriesPoint(data) {
  return (data || []).reduce((highest, point) => {
    const value = Number(point?.[1]);
    if (!Number.isFinite(value)) return highest;
    if (!highest || value > highest[1]) return [point[0], value];
    return highest;
  }, null);
}

function getLastSeriesPoint(data) {
  for (let index = (data || []).length - 1; index >= 0; index -= 1) {
    const point = data[index];
    const value = Number(point?.[1]);
    if (Number.isFinite(value)) return [point[0], value];
  }

  return null;
}

function getSeriesExtent(series) {
  let startTime = Infinity;
  let endTime = -Infinity;
  series.forEach(item => {
    const firstTime = parseDate(item.points[0]?.[0]);
    const lastTime = parseDate(item.points[item.points.length - 1]?.[0]);
    if (firstTime !== null) startTime = Math.min(startTime, firstTime);
    if (lastTime !== null) endTime = Math.max(endTime, lastTime);
  });
  return Number.isFinite(startTime) && Number.isFinite(endTime) && startTime < endTime ? { startTime, endTime } : null;
}

function buildPresetWindow(extent, period, series) {
  const targetStart = period === 'ytd'
    ? getYtdWindowStart(extent, series)
    : extent.endTime - periodDays(period) * DAY_MS;
  return {
    window: { startTime: Math.max(extent.startTime, targetStart), endTime: extent.endTime },
    isClamped: targetStart < extent.startTime - PRESET_CLAMP_TOLERANCE_MS
  };
}

// YTD starts at the previous year's last NAV so the chart matches the "今年" and annual return values.
function getYtdWindowStart(extent, series) {
  const yearStart = new Date(new Date(extent.endTime).getFullYear(), 0, 1).getTime();
  const baseTimes = series
    .map(item => findLastTimeBefore(item.points, yearStart))
    .filter(time => time !== null);
  return baseTimes.length ? Math.max(...baseTimes) : yearStart;
}

function findLastTimeBefore(points, time) {
  let found = null;
  for (const point of points) {
    const pointTime = parseDate(point[0]);
    if (pointTime === null) continue;
    if (pointTime >= time) break;
    found = pointTime;
  }
  return found;
}

function clampWindow(zoomWindow, extent) {
  const startTime = Math.min(Math.max(zoomWindow.startTime, extent.startTime), extent.endTime);
  const endTime = Math.min(Math.max(zoomWindow.endTime, startTime), extent.endTime);
  return endTime > startTime ? { startTime, endTime } : { ...extent };
}

function isSameWindow(a, b) {
  return Math.abs(a.startTime - b.startTime) <= ZOOM_MATCH_TOLERANCE_MS
    && Math.abs(a.endTime - b.endTime) <= ZOOM_MATCH_TOLERANCE_MS;
}

function buildYAxisBounds(series, benchmark, zoomWindow, reserveLabelRoom = false) {
  const values = [
    ...series.flatMap(item => item.points || []),
    ...(benchmark || [])
  ]
    .filter(point => isPointInZoom(point, zoomWindow))
    .map(point => Number(point?.[1]))
    .filter(value => Number.isFinite(value));

  const bounds = calculateYAxisBounds(values);
  if (!reserveLabelRoom) return bounds;
  // Leave a tick of headroom when the extremes touch the axis so high/low labels clear the plot edge.
  const dataMin = Math.min(...values);
  const dataMax = Math.max(...values);
  const margin = (bounds.max - bounds.min) * 0.08;
  return {
    ...bounds,
    min: dataMin - bounds.min < margin ? bounds.min - bounds.interval : bounds.min,
    max: bounds.max - dataMax < margin ? bounds.max + bounds.interval : bounds.max
  };
}

function calculateYAxisBounds(values) {
  values.push(0);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;
  if (!(span > 0)) return { min: min - 0.2, max: max + 0.2, interval: 0.2 };

  // Pick the finest "nice" step that keeps the split count readable, so the axis hugs the data.
  const candidates = getNiceYAxisSteps(span / CHART_Y_AXIS_TARGET_SPLITS);
  for (const interval of candidates) {
    const axisMin = Math.floor(min / interval) * interval;
    const axisMax = Math.ceil(max / interval) * interval;
    if ((axisMax - axisMin) / interval <= CHART_Y_AXIS_TARGET_SPLITS + 2) {
      return { min: axisMin, max: axisMax > axisMin ? axisMax : axisMin + interval, interval };
    }
  }
  const interval = candidates[candidates.length - 1];
  return { min: Math.floor(min / interval) * interval, max: Math.ceil(max / interval) * interval, interval };
}

function getNiceYAxisSteps(rawInterval) {
  if (!Number.isFinite(rawInterval) || rawInterval <= 0.2) return [0.2, 0.5, 1];
  const magnitude = 10 ** Math.floor(Math.log10(rawInterval));
  return [magnitude / 10, magnitude, magnitude * 10]
    // 2.5 only from 1% up so sub-1% ticks keep one decimal place.
    .flatMap(base => (base < 1 ? [1, 2, 5] : [1, 2, 2.5, 5]).map(step => Number((step * base).toPrecision(6))))
    .filter(step => step >= 0.2 && step >= rawInterval * 0.5)
    .sort((a, b) => a - b);
}

function isPointInZoom(point, zoomWindow) {
  if (!zoomWindow) return true;
  const time = parseDate(point?.[0]);
  return time !== null && time >= zoomWindow.startTime && time <= zoomWindow.endTime;
}

function rebaseSeriesForZoom(series, zoomWindow) {
  return series.map(item => {
    const basePoint = findBasePoint(item.points, zoomWindow.startTime);
    if (!basePoint) return item;
    const baseValue = returnToValue(basePoint[1]);
    return {
      ...item,
      points: item.points.map(point => [
        point[0],
        (returnToValue(point[1]) / baseValue - 1) * 100,
        point[2],
        point[3],
        point[4]
      ])
    };
  });
}

function findBasePoint(points, startTime) {
  let fallback = null;
  for (const point of points) {
    const time = parseDate(point[0]);
    if (time === null) continue;
    if (time >= startTime) return point;
    fallback = point;
  }
  return fallback;
}

function returnToValue(returnValue) {
  return 1 + (Number(returnValue) || 0) / 100;
}

function buildDrawdown(item, zoomWindow, yAxisBounds, theme) {
  const segment = getMaxDrawdownSegment(filterPointsByZoom(item.points, zoomWindow));
  if (!segment.points.length) return null;
  const startTime = parseDate(segment.points[0][0]);
  const endTime = parseDate(segment.points[segment.points.length - 1][0]);
  const labelText = formatPercent(segment.maxDrawdown);
  const labelPlacement = getDrawdownLabelPlacement(startTime, endTime, zoomWindow, labelText);
  return {
    value: segment.maxDrawdown,
    series: {
      name: DRAWDOWN_NAME,
      type: 'line',
      showSymbol: false,
      silent: true,
      z: 2,
      tooltip: { show: false },
      emphasis: { disabled: true },
      itemStyle: { color: theme.drawdownLegend },
      lineStyle: { opacity: 0 },
      // Fill from the curve down to the plot floor, fading so the line above stays the focus.
      areaStyle: {
        origin: 'start',
        color: {
          type: 'linear',
          x: 0,
          y: 0,
          x2: 0,
          y2: 1,
          colorStops: [
            { offset: 0, color: theme.drawdownFillTop },
            { offset: 1, color: theme.drawdownFillBottom }
          ]
        }
      },
      data: segment.points.map(point => [parseDate(point[0]), point[1], point[0]]),
      markPoint: {
        animation: false,
        data: [{
          coord: [labelPlacement.time, yAxisBounds.min],
          symbol: 'circle',
          symbolSize: 1,
          itemStyle: { color: 'transparent' },
          label: {
            show: true,
            position: 'top',
            distance: 8,
            align: labelPlacement.align,
            offset: labelPlacement.offset,
            formatter: () => labelText,
            color: theme.down,
            fontSize: 11,
            fontWeight: 600,
            backgroundColor: theme.labelBackground,
            padding: [2, 5],
            borderRadius: 3
          }
        }]
      }
    }
  };
}

function getDrawdownLabelPlacement(startTime, endTime, zoomWindow, labelText) {
  // Estimate the plot width (chart width minus right-side axis labels and grid padding) to size the label in pixels.
  const plotWidth = Math.max(200, (trendChart?.getWidth() || 800) - 90);
  const pxPerMs = plotWidth / Math.max(1, zoomWindow.endTime - zoomWindow.startTime);
  const labelWidth = labelText.length * 6.6 + 12;
  if ((endTime - startTime) * pxPerMs >= labelWidth + 8) {
    return { time: (startTime + endTime) / 2, align: 'center', offset: [0, 0] };
  }
  // Too narrow to hold the value: sit just outside the band, preferring the side away from the trough's low label.
  if ((startTime - zoomWindow.startTime) * pxPerMs >= labelWidth + 4) {
    return { time: startTime, align: 'right', offset: [-4, 0] };
  }
  return { time: endTime, align: 'left', offset: [4, 0] };
}

function filterPointsByZoom(points, zoomWindow) {
  if (!zoomWindow) return points || [];
  return (points || []).filter(point => isPointInZoom(point, zoomWindow));
}

function getMaxDrawdownSegment(points) {
  if (!Array.isArray(points) || points.length < 2) return { points: [], maxDrawdown: 0 };

  let peakIndex = -1;
  let peakValue = -Infinity;
  let segmentStartIndex = -1;
  let segmentEndIndex = -1;
  let maxDrawdown = 0;

  points.forEach((point, index) => {
    const returnValue = Number(point?.[1]);
    if (!Number.isFinite(returnValue)) return;

    const navValue = returnToValue(returnValue);
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

  if (segmentStartIndex < 0 || segmentEndIndex <= segmentStartIndex) return { points: [], maxDrawdown: 0 };
  return {
    points: points.slice(segmentStartIndex, segmentEndIndex + 1),
    maxDrawdown: maxDrawdown * 100
  };
}

function periodDays(period) {
  if (period === 'm1') return 30;
  if (period === 'm3') return 90;
  if (period === 'm6') return 180;
  if (period === 'y1') return 365;
  if (period === 'y3') return 365 * 3;
  return 365 * 5;
}

function getChartHeading(context) {
  const { period, preset, zoomWindow } = context;
  const isCustom = Boolean(customZoomWindow);
  const notes = [`${formatTimeDate(zoomWindow.startTime)} 至 ${formatTimeDate(zoomWindow.endTime)}`];
  if (!isCustom && preset.isClamped) notes.push(`可用历史不足${PERIODS[period]}`);
  return {
    isCustom,
    title: isCustom ? '自定义区间收益走势' : `${PERIODS[period]}收益走势`,
    range: notes.join(' · ')
  };
}

function updateChartMeta(context) {
  const heading = getChartHeading(context);
  document.getElementById('chartTitle').textContent = heading.title;
  document.getElementById('chartRange').textContent = heading.range;
  document.getElementById('chartHint').hidden = false;
  const reset = document.getElementById('chartZoomReset');
  reset.hidden = !heading.isCustom;
  reset.textContent = `复位到${PERIODS[context.period]}`;
}

function clearChartMeta() {
  document.getElementById('chartRange').textContent = '';
  document.getElementById('chartHint').hidden = true;
  document.getElementById('chartZoomReset').hidden = true;
}

function buildChartAriaDescription(context, rebasedSeries) {
  const heading = getChartHeading(context);
  const returns = rebasedSeries.map(item => {
    const lastPoint = getLastSeriesPoint(filterPointsByZoom(item.points, context.zoomWindow));
    return `${seriesName(item)} 区间收益 ${formatPercent(lastPoint?.[1])}`;
  });
  return `${heading.title}，${heading.range}。${returns.join('；')}。`;
}

function formatChartTooltip(params) {
  const context = currentChartContext;
  if (!context) return '';
  const fundCount = context.series.length;
  const referenceTime = Number(params[0]?.axisValue);
  const fundParams = params.filter(item => item.seriesIndex < fundCount
    && Array.isArray(item.value)
    && (!Number.isFinite(referenceTime) || Math.abs(Number(item.value[0]) - referenceTime) <= TOOLTIP_MATCH_TOLERANCE_MS));
  if (!fundParams.length) return '';

  const benchmarkParam = params.find(item => item.seriesName === BENCHMARK_NAME);
  const benchmarkValue = Array.isArray(benchmarkParam?.value) ? benchmarkParam.value[1] : null;
  const date = fundParams[0].value[2] || '';

  if (fundCount === 1) {
    const value = fundParams[0].value;
    const excess = Number.isFinite(benchmarkValue) && Number.isFinite(value[1]) ? value[1] - benchmarkValue : null;
    return `<div class="trend-tooltip">
      <div class="tooltip-single">
        <div class="tooltip-name tooltip-single-name">${escapeHtml(fundParams[0].seriesName)}</div>
        <div class="tooltip-detail-lines">
          <div><span>净值日期</span><strong>${escapeHtml(date)}</strong><span>日涨幅</span><strong class="${classFor(value[5])}">${formatPercent(value[5])}</strong></div>
          <div><span>区间收益</span><strong class="${classFor(value[1])}">${formatPercent(value[1])}</strong><span>单位净值</span><strong>${formatNav(value[3])}</strong></div>
          ${Number.isFinite(benchmarkValue) ? `<div><span>${escapeHtml(BENCHMARK_NAME)}</span><strong>${formatPercent(benchmarkValue)}</strong><span>超额</span><strong class="${classFor(excess)}">${formatPercent(excess)}</strong></div>` : ''}
        </div>
      </div>
    </div>`;
  }

  const rows = fundParams
    .slice()
    .sort((a, b) => (Number(b.value[1]) || 0) - (Number(a.value[1]) || 0))
    .map(item => {
      const slot = context.series[item.seriesIndex]?.slot ?? 0;
      return `<div class="tooltip-row">
        <div class="tooltip-main">
          <span class="tooltip-name"><span class="series-swatch" data-slot="${slot}"></span>${escapeHtml(item.seriesName)}</span>
          <strong class="tooltip-value ${classFor(item.value[1])}">${formatPercent(item.value[1])}</strong>
        </div>
      </div>`;
    })
    .join('');

  return `<div class="trend-tooltip">
    <div class="tooltip-date"><span>净值日期</span><strong>${escapeHtml(date)}</strong></div>
    ${rows}
    ${Number.isFinite(benchmarkValue) ? `<div class="tooltip-row tooltip-benchmark">
      <div class="tooltip-main">
        <span class="tooltip-name"><span class="series-swatch benchmark-swatch"></span>${escapeHtml(BENCHMARK_NAME)}基准</span>
        <strong class="tooltip-value">${formatPercent(benchmarkValue)}</strong>
      </div>
    </div>` : ''}
  </div>`;
}

function getCssVar(name, fallback) {
  return getComputedStyle(document.body).getPropertyValue(name).trim() || fallback;
}

function toRgba(color, alpha) {
  if (!colorContext) return color;
  colorContext.fillStyle = '#000000';
  colorContext.fillStyle = color;
  const normalized = String(colorContext.fillStyle);
  const hex = /^#([0-9a-f]{6})$/i.exec(normalized);
  if (hex) {
    const value = Number.parseInt(hex[1], 16);
    return `rgba(${value >> 16}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`;
  }
  const rgba = /^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)$/.exec(normalized);
  if (rgba) {
    const baseAlpha = rgba[4] === undefined ? 1 : Number(rgba[4]);
    return `rgba(${rgba[1]}, ${rgba[2]}, ${rgba[3]}, ${baseAlpha * alpha})`;
  }
  return color;
}

function renderNavList(metric, period) {
  const chartEl = document.getElementById('chart');
  const listEl = document.getElementById('navList');
  disposeChart();
  clearChartMeta();
  chartEl.hidden = true;
  listEl.hidden = false;
  document.getElementById('chartTitle').textContent = `${PERIODS[period]}历史净值列表`;

  const points = filterListPoints(metric?.chartSeries?.[period] || [], period);
  if (!points.length) {
    listEl.innerHTML = '<div class="empty-state">当前周期暂无历史净值数据</div>';
    return;
  }

  const rows = points.slice().reverse();
  const pageCount = Math.max(1, Math.ceil(rows.length / NAV_LIST_PAGE_SIZE));
  currentListPage = Math.min(Math.max(currentListPage, 1), pageCount);
  const pageRows = rows.slice((currentListPage - 1) * NAV_LIST_PAGE_SIZE, currentListPage * NAV_LIST_PAGE_SIZE);

  const rowCount = Math.ceil(pageRows.length / 2);
  const tableRows = [];
  for (let index = 0; index < rowCount; index += 1) {
    tableRows.push([pageRows[index], pageRows[index + rowCount]]);
  }

  listEl.innerHTML = `<table class="nav-table">
    <thead>
      <tr>
        <th>日期</th>
        <th>单位净值</th>
        <th>累计净值</th>
        <th>日涨幅</th>
        <th>日期</th>
        <th>单位净值</th>
        <th>累计净值</th>
        <th>日涨幅</th>
      </tr>
    </thead>
    <tbody>
      ${tableRows.map(([left, right]) => `<tr>
        ${renderNavTableCells(left)}
        ${right ? renderNavTableCells(right) : '<td class="nav-empty" colspan="4"></td>'}
      </tr>`).join('')}
    </tbody>
  </table>
  <div class="pager">
    <span>第 ${currentListPage} / ${pageCount} 页，共 ${rows.length} 条</span>
    <div class="pager-actions">
      <button type="button" data-page="1" ${currentListPage <= 1 ? 'disabled' : ''}>首页</button>
      <button type="button" data-page="${currentListPage - 1}" ${currentListPage <= 1 ? 'disabled' : ''}>上一页</button>
      ${renderPageButtons(currentListPage, pageCount)}
      <button type="button" data-page="${currentListPage + 1}" ${currentListPage >= pageCount ? 'disabled' : ''}>下一页</button>
      <button type="button" data-page="${pageCount}" ${currentListPage >= pageCount ? 'disabled' : ''}>末页</button>
    </div>
    <form class="pager-jump" data-page-count="${pageCount}">
      <label>跳至 <input type="number" name="page" min="1" max="${pageCount}" value="${currentListPage}"> 页</label>
      <button type="submit">跳转</button>
    </form>
  </div>`;
}

// The YTD series carries the previous year's closing NAV as its return base; the list only shows this year's rows.
function filterListPoints(points, period) {
  if (period !== 'ytd' || !points.length) return points;
  const year = String(points[points.length - 1][0]).slice(0, 4);
  return points.filter(point => String(point[0]).startsWith(year));
}

function renderPageButtons(currentPage, pageCount) {
  const pages = new Set([1, pageCount]);
  for (let page = currentPage - 2; page <= currentPage + 2; page += 1) {
    if (page >= 1 && page <= pageCount) pages.add(page);
  }

  let previousPage = 0;
  return [...pages].sort((a, b) => a - b).map(page => {
    const gap = page - previousPage > 1 ? '<span class="pager-gap">...</span>' : '';
    previousPage = page;
    return `${gap}<button type="button" data-page="${page}" class="pager-page${page === currentPage ? ' active' : ''}" aria-current="${page === currentPage ? 'page' : 'false'}" ${page === currentPage ? 'disabled' : ''}>${page}</button>`;
  }).join('');
}

function renderNavTableCells(point) {
  return `<td>${escapeHtml(point[0])}</td>
    <td>${formatNav(point[2])}</td>
    <td>${formatNav(point[3])}</td>
    <td class="${classFor(point[4])}">${formatPercent(point[4])}</td>`;
}

function renderMetrics(metrics, period) {
  if (currentPayload?.target?.kind === 'fund' && metrics.length === 1) {
    renderSingleFundMetrics(metrics[0]);
    return;
  }

  const rankings = buildMetricRankings(metrics, period);
  const showSwatch = metrics.length > 1;
  document.getElementById('metrics').innerHTML = metrics.map((metric, index) => {
    const current = metric.periods?.[period] || {};
    const highlights = buildMetricHighlights(metric, rankings);
    const selectedClass = selectedFundCode === metric.code ? ' selected' : '';
    const swatch = showSwatch ? `<span class="series-swatch" data-slot="${index}"></span>` : '';
    return `<article class="card fund-metric-card${selectedClass}" data-code="${escapeHtml(metric.code)}" role="button" tabindex="0" title="点击仅显示此基金曲线，再次点击恢复全部曲线">
      <div class="fund-card-header">
        <div class="fund-card-title-block">
          <div class="card-title">${swatch}${escapeHtml(metric.name)}</div>
          <div class="fund-code">${escapeHtml(metric.code)} · ${escapeHtml(PERIODS[period])}</div>
        </div>
        <div class="card-value ${classFor(current.returnValue)} ${highlights.returnValue}">${formatPercent(current.returnValue)}</div>
      </div>
      <div class="metric-grid">
        <div class="metric-cell ${highlights.maxDrawdown}"><span>最大回撤</span><strong class="${classFor(current.maxDrawdown)}">${formatPercent(current.maxDrawdown)}</strong></div>
        <div class="metric-cell ${highlights.annualizedVolatility}"><span>年化波动</span><strong>${formatPercent(current.annualizedVolatility)}</strong></div>
        <div class="metric-cell ${highlights.calmarRatio}"><span>卡玛比率</span><strong>${formatNumber(current.calmarRatio)}</strong></div>
        <div class="metric-cell ${highlights.upDayRatio}"><span>上涨占比</span><strong>${formatPercent(current.upDayRatio)}</strong></div>
      </div>
      <div class="fund-card-footer">
        <span>规模 ${formatScale(metric.scale)}</span>
        <span>经理 ${escapeHtml(metric.manager || '-')}</span>
      </div>
    </article>`;
  }).join('');
  bindMetricCardSelection();
}

function renderSingleFundMetrics(metric) {
  document.getElementById('metrics').innerHTML = `<article class="card fund-detail-card">
    <div class="fund-card-header">
      <div class="fund-card-title-block">
        <div class="card-title">${escapeHtml(metric.name)} ${escapeHtml(metric.code)} · ${escapeHtml(metric.latestDate || '-')}</div>
      </div>
      <div class="fund-card-meta">
        <span>规模 ${formatScale(metric.scale)}</span>
        <span>经理 ${escapeHtml(metric.manager || '-')}</span>
      </div>
    </div>
    <div class="period-metric-table-wrap">
      <table class="period-metric-table">
        <thead>
          <tr>
            <th>周期</th>
            <th>收益</th>
            <th>最大回撤</th>
            <th>年化波动</th>
            <th>卡玛</th>
            <th>上涨占比</th>
          </tr>
        </thead>
        <tbody>
          ${DETAIL_PERIODS.map(periodKey => {
            const current = metric.periods?.[periodKey] || {};
            const activeClass = periodKey === currentPeriod ? ' class="active"' : '';
            return `<tr${activeClass}>
              <td>${escapeHtml(PERIODS[periodKey])}</td>
              <td class="${classFor(current.returnValue)}">${formatPercent(current.returnValue)}</td>
              <td class="${classFor(current.maxDrawdown)}">${formatPercent(current.maxDrawdown)}</td>
              <td>${formatPercent(current.annualizedVolatility)}</td>
              <td>${formatNumber(current.calmarRatio)}</td>
              <td>${formatPercent(current.upDayRatio)}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
    ${renderAnnualReturns(metric.annualReturns)}
  </article>`;
}

function renderAnnualReturns(annualReturns) {
  const rows = Array.isArray(annualReturns) ? annualReturns : [];
  if (!rows.length) return '';
  return `<div class="annual-return-section">
    <div class="annual-return-title">年度表现</div>
    <div class="period-metric-table-wrap">
      <table class="period-metric-table annual-return-table">
        <thead>
          <tr><th>年度</th>${rows.map(row => `<th>${escapeHtml(formatAnnualLabel(row))}</th>`).join('')}</tr>
        </thead>
        <tbody>
          <tr><th scope="row">收益</th>${rows.map(row => `<td class="${classFor(row.returnValue)}" title="${escapeHtml(formatAnnualRange(row))}">${formatPercent(row.returnValue)}</td>`).join('')}</tr>
          <tr><th scope="row">最大回撤</th>${rows.map(row => `<td class="${classFor(row.maxDrawdown)}" title="${escapeHtml(formatDrawdownRange(row))}">${formatPercent(row.maxDrawdown)}</td>`).join('')}</tr>
        </tbody>
      </table>
    </div>
  </div>`;
}

function renderAnnualCompare(metrics, targetKind) {
  const container = document.getElementById('annualCompare');
  const years = [...new Set(metrics.flatMap(metric => (metric.annualReturns || []).map(row => row.year)))].sort((a, b) => b - a);
  if (targetKind === 'fund' || !years.length) {
    container.innerHTML = '';
    return;
  }

  const latestYear = years[0];
  const field = annualCompareMetric;
  // Drawdowns are negative, so the largest value is also the shallowest drawdown.
  const bestByYear = new Map(years.map(year => {
    const values = metrics
      .map(metric => findAnnualReturn(metric, year)?.[field])
      .filter(value => Number.isFinite(value));
    return [year, values.length > 1 ? Math.max(...values) : null];
  }));

  container.innerHTML = `<article class="card annual-compare-card">
    <div class="annual-compare-header">
      <div class="card-title">年度${field === 'maxDrawdown' ? '最大回撤' : '收益'}对比</div>
      <div class="view-tabs annual-compare-tabs" role="radiogroup" aria-label="年度指标">
        <label><input type="radio" name="annualCompareMetric" value="returnValue"${field === 'returnValue' ? ' checked' : ''}><span>收益</span></label>
        <label><input type="radio" name="annualCompareMetric" value="maxDrawdown"${field === 'maxDrawdown' ? ' checked' : ''}><span>最大回撤</span></label>
      </div>
    </div>
    <div class="period-metric-table-wrap">
      <table class="period-metric-table annual-compare-table">
        <thead>
          <tr>
            <th>基金</th>
            ${years.map(year => `<th>${year === latestYear ? '今年以来' : year}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${metrics.map((metric, index) => {
            const selectedClass = selectedFundCode === metric.code ? ' class="selected"' : '';
            return `<tr${selectedClass} data-code="${escapeHtml(metric.code)}" tabindex="0" title="点击仅显示此基金曲线，再次点击恢复全部曲线">
              <td><span class="annual-compare-name"><span class="series-swatch" data-slot="${index}"></span>${escapeHtml(metric.name)} <span class="fund-code">${escapeHtml(metric.code)}</span></span></td>
              ${years.map(year => renderAnnualCompareCell(findAnnualReturn(metric, year), field, bestByYear.get(year))).join('')}
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
    <div class="annual-compare-note">每列${field === 'maxDrawdown' ? '回撤最小' : '收益最高'}加下划线；* 表示当年数据不足整年。</div>
  </article>`;
  bindAnnualCompareSelection(container);
}

function findAnnualReturn(metric, year) {
  return (metric.annualReturns || []).find(row => row.year === year) || null;
}

function renderAnnualCompareCell(row, field, bestValue) {
  if (!row) return '<td class="neutral">-</td>';
  const value = row[field];
  const highlight = Number.isFinite(bestValue) && value === bestValue ? ' metric-highlight' : '';
  const suffix = row.startsMidYear && !row.isYearToDate ? '*' : '';
  const title = field === 'maxDrawdown' ? formatDrawdownRange(row) : formatAnnualRange(row);
  return `<td class="${classFor(value)}${highlight}" title="${escapeHtml(title)}">${formatPercent(value)}${suffix}</td>`;
}

function bindAnnualCompareSelection(container) {
  container.querySelector('.annual-compare-tabs')?.addEventListener('change', event => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || input.name !== 'annualCompareMetric') return;
    annualCompareMetric = input.value === 'maxDrawdown' ? 'maxDrawdown' : 'returnValue';
    renderAnnualCompare(currentPayload?.metrics || [], currentPayload?.target?.kind);
  });
  container.querySelectorAll('tr[data-code]').forEach(row => {
    const select = () => toggleSelectedFund(row.dataset.code);
    row.onclick = select;
    row.onkeydown = event => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      select();
    };
  });
}

function formatDrawdownRange(row) {
  if (!Number.isFinite(row.maxDrawdown) || !row.maxDrawdownStartDate) return `${formatAnnualRange(row)}，期间无回撤`;
  return `回撤区间 ${row.maxDrawdownStartDate} 至 ${row.maxDrawdownEndDate || '-'}`;
}

function formatAnnualLabel(row) {
  if (row.isYearToDate) return '今年以来';
  return row.startsMidYear ? `${row.year}*` : String(row.year);
}

function formatAnnualRange(row) {
  const range = `${row.startDate || '-'} 至 ${row.endDate || '-'}`;
  return row.startsMidYear ? `${range}（区间内数据不足整年）` : range;
}

function bindMetricCardSelection() {
  document.querySelectorAll('.fund-metric-card').forEach(card => {
    const select = () => toggleSelectedFund(card.dataset.code);
    card.onclick = select;
    card.onkeydown = event => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      select();
    };
  });
}

function toggleSelectedFund(code) {
  if (!code) return;
  selectedFundCode = selectedFundCode === code ? null : code;
  legendSelected = Object.fromEntries(Object.entries(legendSelected).filter(([name]) => !name.endsWith(` ${code}`)));
  renderCurrentTrend();
}

function metricValue(metric, period, field) {
  const value = metric?.periods?.[period]?.[field];
  return Number.isFinite(value) ? value : null;
}

function buildMetricRankings(metrics, period) {
  const returns = rankMetrics(metrics, period, 'returnValue', 'desc');
  const drawdowns = rankMetrics(metrics, period, 'maxDrawdown', 'desc');
  const calmar = rankMetrics(metrics, period, 'calmarRatio', 'desc');
  const volatility = rankMetrics(metrics, period, 'annualizedVolatility', 'asc');
  const upDayRatio = rankMetrics(metrics, period, 'upDayRatio', 'desc');
  return { returns, drawdowns, calmar, volatility, upDayRatio };
}

function rankMetrics(metrics, period, field, direction) {
  return new Map(metrics
    .filter(metric => Number.isFinite(metricValue(metric, period, field)))
    .sort((a, b) => {
      const diff = metricValue(a, period, field) - metricValue(b, period, field);
      return direction === 'desc' ? -diff : diff;
    })
    .map((metric, index) => [metric.code, index + 1]));
}

function buildMetricHighlights(metric, rankings) {
  return {
    returnValue: rankings.returns.get(metric.code) === 1 ? 'metric-highlight' : '',
    calmarRatio: rankings.calmar.get(metric.code) === 1 ? 'metric-highlight' : '',
    annualizedVolatility: rankings.volatility.get(metric.code) === 1 ? 'metric-highlight' : '',
    upDayRatio: rankings.upDayRatio.get(metric.code) === 1 ? 'metric-highlight' : '',
    maxDrawdown: rankings.drawdowns.get(metric.code) === rankings.drawdowns.size && rankings.drawdowns.size > 1 ? 'metric-risk-highlight' : ''
  };
}

function buildAnnualBenchmarkSeries(series, startTime) {
  const dates = [...new Set(series.flatMap(item => item.points.map(point => point[0])))].sort();
  if (dates.length < 2) return [];
  return dates.map(date => {
    const current = parseDate(date);
    const days = current === null ? 0 : Math.max(0, (current - startTime) / DAY_MS);
    const value = ((1 + ANNUAL_BENCHMARK / 100) ** (days / 365) - 1) * 100;
    return [date, value];
  });
}

function formatDateTick(value, spanMs) {
  const parts = formatTimeDate(value).split('-');
  if (parts.length < 3) return '';
  if (spanMs <= 150 * DAY_MS) return `${parts[1]}/${parts[2]}`;
  return `${parts[0].slice(2)}/${parts[1]}`;
}

function formatTimeDate(value) {
  const date = new Date(Number(value));
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('sv-SE');
}

function formatShortDate(date) {
  const parts = String(date || '').split('-');
  return parts.length < 3 ? String(date || '') : `${parts[0].slice(2)}/${parts[1]}/${parts[2]}`;
}

function parseDate(date) {
  const time = new Date(`${date}T00:00:00`).getTime();
  return Number.isFinite(time) ? time : null;
}

function updatePeriodTabs() {
  document.querySelectorAll('#periodTabs button').forEach(button => {
    button.classList.toggle('active', button.dataset.period === currentPeriod);
  });
}

function setStatus(text) {
  document.getElementById('status').textContent = text;
}

function formatPercent(value) {
  return Number.isFinite(value) ? `${value > 0 ? '+' : ''}${value.toFixed(2)}%` : '-';
}

function formatAxisPercent(value, interval) {
  if (!Number.isFinite(value)) return '-';
  if (Math.abs(value) < 1e-10) return '0%';
  const digits = Number.isFinite(interval) && !Number.isInteger(interval) ? 1 : 0;
  return `${value > 0 ? '+' : ''}${value.toFixed(digits)}%`;
}

function formatNumber(value) {
  return Number.isFinite(value) ? value.toFixed(2) : '-';
}

function formatNav(value) {
  return Number.isFinite(value) ? value.toFixed(4) : '-';
}

function formatScale(scale) {
  if (!scale || !Number.isFinite(scale.value)) return '-';
  return `${scale.value.toFixed(2)}亿`;
}

function classFor(value) {
  return Number.isFinite(value) ? (value > 0 ? 'positive' : value < 0 ? 'negative' : 'neutral') : 'neutral';
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
