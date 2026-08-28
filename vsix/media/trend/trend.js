const vscode = acquireVsCodeApi();
const PERIODS = {
  ytd: '今年',
  m1: '近1月',
  m3: '近3月',
  m6: '近6月',
  y1: '近1年',
  y3: '近3年'
};
const DETAIL_PERIODS = ['m1', 'm3', 'm6', 'ytd', 'y1', 'y3'];
const ANNUAL_BENCHMARK = 10;
const NAV_LIST_PAGE_SIZE = 20;
const CHART_Y_AXIS_PADDING_RATIO = 0.12;
let currentPayload = null;
let currentPeriod = 'm3';
let currentViewMode = 'chart';
let currentListPage = 1;
let selectedFundCode = null;
let trendChart = null;
let currentChartContext = null;
let isRebasingChart = false;

window.addEventListener('resize', () => {
  trendChart?.resize();
});

document.getElementById('periodTabs').addEventListener('click', event => {
  const target = event.target;
  if (!(target instanceof HTMLButtonElement)) return;
  const period = target.dataset.period;
  if (!period || !PERIODS[period] || period === currentPeriod) return;
  currentPeriod = period;
  currentListPage = 1;
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
    disposeChart();
    document.getElementById('chart').innerHTML = '<div class="card">暂无可展示数据</div>';
    document.getElementById('navList').innerHTML = '';
    document.getElementById('metrics').innerHTML = '';
  }
});

function renderTrend(payload) {
  currentPayload = payload;
  renderCurrentTrend();
}

function renderCurrentTrend() {
  if (!currentPayload) return;
  const { target, nav, metrics } = currentPayload;
  document.getElementById('title').textContent = target.title;
  setStatus(nav.failedCodes.length ? `加载失败 ${nav.failedCodes.join(', ')}` : '');
  if (selectedFundCode && !metrics.some(metric => metric.code === selectedFundCode)) selectedFundCode = null;
  if (target.kind !== 'fund') currentViewMode = 'chart';
  updatePeriodTabs();
  updateViewTabs(target.kind === 'fund');
  renderSummary(metrics, currentPeriod);
  if (currentViewMode === 'list' && target.kind === 'fund') {
    renderNavList(metrics[0], currentPeriod);
  } else {
    renderChart(metrics, currentPeriod);
  }
  renderMetrics(metrics, currentPeriod);
}

function renderSummary(metrics, period) {
  document.getElementById('summary').innerHTML = '';
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
  if (!metrics.length) {
    disposeChart();
    chartEl.innerHTML = '<div class="card">暂无可展示数据</div>';
    return;
  }

  document.getElementById('chartTitle').textContent = `${PERIODS[period]}累计收益走势`;
  const visibleMetrics = selectedFundCode ? metrics.filter(metric => metric.code === selectedFundCode) : metrics;
  const series = visibleMetrics
    .map(metric => ({ metric, points: metric.chartSeries?.y3 || metric.chartSeries?.[period] || [] }))
    .filter(item => item.points.length > 1);
  if (!series.length) {
    disposeChart();
    chartEl.innerHTML = '<div class="empty-state">当前周期暂无足够历史数据</div>';
    return;
  }

  if (!window.echarts) {
    disposeChart();
    chartEl.innerHTML = '<div class="empty-state">ECharts 加载失败，无法展示趋势图</div>';
    return;
  }

  if (!trendChart || trendChart.isDisposed()) {
    chartEl.innerHTML = '';
    trendChart = echarts.init(chartEl, null, { renderer: 'canvas' });
  }
  currentChartContext = { series, period, zoomRange: buildZoomRange(series, period) };
  bindChartZoomRebase();
  trendChart.setOption(buildChartOption(currentChartContext), true);
  trendChart.resize();
}

function disposeChart() {
  if (!trendChart) return;
  trendChart.dispose();
  trendChart = null;
  currentChartContext = null;
}

function buildChartOption(context) {
  const { series, period, zoomRange } = context;
  const colors = getChartColors();
  const zoomBounds = getZoomBounds(series, zoomRange);
  const rebasedSeries = rebaseSeriesForZoom(series, zoomRange);
  const benchmark = buildAnnualBenchmarkSeries(rebasedSeries, zoomBounds?.startTime ?? null);
  const yAxisBounds = buildYAxisBounds(rebasedSeries, benchmark, zoomBounds);
  const lineSeries = rebasedSeries.map(item => ({
    name: `${item.metric.name} ${item.metric.code}`,
    type: 'line',
    showSymbol: false,
    smooth: false,
    sampling: 'lttb',
    emphasis: { focus: 'series' },
    lineStyle: { width: 2 },
    data: item.points.map(point => [parseDate(point[0]), point[1], point[0], point[2], point[3], point[4]])
  }));
  const drawdownSeries = rebasedSeries.length === 1 ? buildDrawdownEchartsSeries(rebasedSeries[0], period) : null;
  const allSeries = [
    {
      name: '年化10%',
      type: 'line',
      showSymbol: false,
      silent: true,
      lineStyle: { width: 1.4, type: 'dashed', color: getCssVar('--vscode-charts-yellow', '#cca700') },
      data: benchmark.map(point => [parseDate(point[0]), point[1], point[0]])
    },
    ...lineSeries
  ];
  if (drawdownSeries) allSeries.push(drawdownSeries);

  return {
    animation: false,
    color: colors,
    backgroundColor: 'transparent',
    textStyle: {
      color: getCssVar('--vscode-foreground', '#cccccc'),
      fontFamily: getCssVar('--vscode-font-family', 'sans-serif'),
      fontSize: Number.parseInt(getCssVar('--vscode-font-size', '13'), 10) || 13
    },
    grid: { left: 12, right: 18, top: 48, bottom: 64, containLabel: true },
    legend: {
      type: 'scroll',
      data: lineSeries.map(item => item.name),
      top: 2,
      itemWidth: 16,
      itemHeight: 8,
      textStyle: { color: getCssVar('--vscode-descriptionForeground', '#999999') },
      pageIconColor: getCssVar('--vscode-button-background', '#0e639c'),
      pageIconInactiveColor: getCssVar('--vscode-disabledForeground', '#666666'),
      pageTextStyle: { color: getCssVar('--vscode-descriptionForeground', '#999999') }
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
      axisLine: { lineStyle: { color: getCssVar('--trend-border', '#454545') } },
      axisTick: { lineStyle: { color: getCssVar('--trend-border', '#454545') } },
      axisLabel: {
        color: getCssVar('--vscode-descriptionForeground', '#999999'),
        formatter: value => formatDateTick(new Date(value).toLocaleDateString('sv-SE'), period)
      },
      splitLine: { show: false }
    },
    yAxis: {
      type: 'value',
      position: 'right',
      ...yAxisBounds,
      axisLabel: {
        color: getCssVar('--vscode-descriptionForeground', '#999999'),
        formatter: value => formatAxisPercent(value)
      },
      splitLine: { lineStyle: { color: getCssVar('--trend-border', '#454545') } }
    },
    dataZoom: [
      { type: 'inside', throttle: 60, ...zoomRange },
      {
        type: 'slider',
        ...zoomRange,
        height: 26,
        bottom: 16,
        borderColor: getCssVar('--trend-border', '#454545'),
        backgroundColor: getCssVar('--trend-soft-bg', 'transparent'),
        fillerColor: getCssVar('--trend-accent-soft', 'rgba(55, 148, 255, .18)'),
        handleStyle: { color: getCssVar('--vscode-button-background', '#0e639c') },
        textStyle: { color: getCssVar('--vscode-descriptionForeground', '#999999') }
      }
    ],
    series: allSeries
  };
}

function bindChartZoomRebase() {
  if (!trendChart) return;
  trendChart.off('datazoom');
  trendChart.on('datazoom', () => {
    if (!trendChart || !currentChartContext || isRebasingChart) return;
    const option = trendChart.getOption();
    const zoom = Array.isArray(option.dataZoom) ? option.dataZoom[0] : null;
    const start = Number.isFinite(zoom?.start) ? zoom.start : currentChartContext.zoomRange.start;
    const end = Number.isFinite(zoom?.end) ? zoom.end : currentChartContext.zoomRange.end;
    currentChartContext.zoomRange = { start, end };
    isRebasingChart = true;
    trendChart.setOption(buildChartOption(currentChartContext), true);
    isRebasingChart = false;
  });
}

function buildYAxisBounds(series, benchmark, zoomBounds) {
  const values = [
    ...series.flatMap(item => item.points || []),
    ...(benchmark || [])
  ]
    .filter(point => isPointInZoom(point, zoomBounds))
    .map(point => Number(point?.[1]))
    .filter(value => Number.isFinite(value));

  if (!values.length) return {};

  values.push(0);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;
  const padding = span > 0 ? span * CHART_Y_AXIS_PADDING_RATIO : Math.max(Math.abs(max) * CHART_Y_AXIS_PADDING_RATIO, 0.5);

  return {
    min: min - padding,
    max: max + padding
  };
}

function isPointInZoom(point, zoomBounds) {
  if (!zoomBounds) return true;
  const time = parseDate(point?.[0]);
  return time !== null && time >= zoomBounds.startTime && time <= zoomBounds.endTime;
}

function rebaseSeriesForZoom(series, zoomRange) {
  const bounds = getZoomBounds(series, zoomRange);
  if (!bounds) return series;
  return series.map(item => {
    const basePoint = findBasePoint(item.points, bounds.startTime);
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

function getZoomBounds(series, zoomRange) {
  const points = series[0]?.points || [];
  const firstTime = parseDate(points[0]?.[0]);
  const lastTime = parseDate(points[points.length - 1]?.[0]);
  if (firstTime === null || lastTime === null || firstTime >= lastTime) return null;
  const start = Number.isFinite(zoomRange?.start) ? zoomRange.start : 0;
  const end = Number.isFinite(zoomRange?.end) ? zoomRange.end : 100;
  return {
    startTime: firstTime + (lastTime - firstTime) * Math.max(0, Math.min(100, start)) / 100,
    endTime: firstTime + (lastTime - firstTime) * Math.max(0, Math.min(100, end)) / 100
  };
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

function buildDrawdownEchartsSeries(item, period) {
  const startDate = item.metric.periods?.[period]?.maxDrawdownStartDate;
  const endDate = item.metric.periods?.[period]?.maxDrawdownEndDate;
  const maxDrawdown = item.metric.periods?.[period]?.maxDrawdown;
  if (!startDate || !endDate || startDate === endDate || !Number.isFinite(maxDrawdown) || maxDrawdown >= 0) return null;

  const startIndex = item.points.findIndex(point => point[0] === startDate);
  const endIndex = item.points.findIndex(point => point[0] === endDate);
  if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) return null;

  return {
    name: '最大回撤区间',
    type: 'line',
    showSymbol: false,
    silent: true,
    lineStyle: { width: 2, color: getCssVar('--vscode-charts-green', '#89d185') },
    data: item.points.slice(startIndex, endIndex + 1).map(point => [parseDate(point[0]), point[1], point[0]])
  };
}

function buildZoomRange(series, period) {
  const points = series[0]?.points || [];
  const firstTime = parseDate(points[0]?.[0]);
  const lastTime = parseDate(points[points.length - 1]?.[0]);
  if (firstTime === null || lastTime === null || firstTime >= lastTime) return {};

  const startTime = period === 'ytd'
    ? new Date(new Date(lastTime).getFullYear(), 0, 1).getTime()
    : lastTime - periodDays(period) * 24 * 60 * 60 * 1000;
  const clampedStart = Math.max(firstTime, startTime);
  return {
    start: Math.max(0, Math.min(100, (clampedStart - firstTime) / (lastTime - firstTime) * 100)),
    end: 100
  };
}

function periodDays(period) {
  if (period === 'm1') return 30;
  if (period === 'm3') return 90;
  if (period === 'm6') return 180;
  if (period === 'y1') return 365;
  return 365 * 3;
}

function formatChartTooltip(params) {
  const visibleParams = params.filter(item => item.seriesName !== '最大回撤区间' && item.seriesName !== '年化10%');
  const first = visibleParams.find(item => Array.isArray(item.value) && item.value[2]);
  const date = first?.value?.[2] || '';
  if (!visibleParams.length) return '';

  const showDetails = visibleParams.length === 1;
  const rows = visibleParams.map(item => {
    const value = Array.isArray(item.value) ? item.value : [];
    const returnClass = classFor(value[1]);
    const dailyClass = classFor(value[5]);
    if (showDetails) {
      return `<div class="tooltip-single">
        <div class="tooltip-name tooltip-single-name">${escapeHtml(item.seriesName)}</div>
        <div class="tooltip-detail-lines">
          <div><span>净值日期</span><strong>${escapeHtml(date)}</strong><span>日涨幅</span><strong class="${dailyClass}">${formatPercent(value[5])}</strong></div>
          <div><span>累计收益</span><strong class="${returnClass}">${formatPercent(value[1])}</strong><span>单位净值</span><strong>${formatNav(value[3])}</strong></div>
        </div>
      </div>`;
    }
    return `<div class="tooltip-row">
      <div class="tooltip-main">
        <span class="tooltip-name">${escapeHtml(item.seriesName)}</span>
        <strong class="tooltip-value ${returnClass}">${formatPercent(value[1])}</strong>
      </div>
    </div>`;
  }).join('');

  if (showDetails) return `<div class="trend-tooltip">${rows}</div>`;

  return `<div class="trend-tooltip">
    <div class="tooltip-date"><span>净值日期</span><strong>${escapeHtml(date)}</strong></div>
    ${rows}
  </div>`;
}

function getChartColors() {
  return [
    getCssVar('--vscode-charts-blue', '#3794ff'),
    getCssVar('--vscode-charts-red', '#f14c4c'),
    getCssVar('--vscode-charts-green', '#89d185'),
    getCssVar('--vscode-charts-yellow', '#cca700'),
    getCssVar('--vscode-charts-purple', '#b180d7'),
    getCssVar('--vscode-charts-foreground', '#cccccc'),
    getCssVar('--vscode-charts-orange', '#d18616'),
    getCssVar('--vscode-terminal-ansiBrightGreen', '#b5cea8'),
    getCssVar('--vscode-terminal-ansiMagenta', '#c586c0'),
    getCssVar('--vscode-terminal-ansiCyan', '#4ec9b0')
  ];
}

function getCssVar(name, fallback) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

function renderNavList(metric, period) {
  const chartEl = document.getElementById('chart');
  const listEl = document.getElementById('navList');
  disposeChart();
  chartEl.hidden = true;
  listEl.hidden = false;
  document.getElementById('chartTitle').textContent = `${PERIODS[period]}历史净值列表`;

  const points = metric?.chartSeries?.[period] || [];
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
  document.getElementById('metrics').innerHTML = metrics.map(metric => {
    const current = metric.periods?.[period] || {};
    const highlights = buildMetricHighlights(metric, rankings);
    const selectedClass = selectedFundCode === metric.code ? ' selected' : '';
    return `<article class="card fund-metric-card${selectedClass}" data-code="${escapeHtml(metric.code)}" role="button" tabindex="0" title="点击仅显示此基金曲线，再次点击恢复全部曲线">
      <div class="fund-card-header">
        <div class="fund-card-title-block">
          <div class="card-title">${escapeHtml(metric.name)}</div>
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
  </article>`;
}

function bindMetricCardSelection() {
  document.querySelectorAll('.fund-metric-card').forEach(card => {
    const select = () => {
      const code = card.dataset.code;
      if (!code) return;
      selectedFundCode = selectedFundCode === code ? null : code;
      renderCurrentTrend();
    };
    card.onclick = select;
    card.onkeydown = event => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      select();
    };
  });
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

function buildAnnualBenchmarkSeries(series, startTime = null) {
  const points = series[0]?.points || [];
  const firstDate = startTime === null ? points[0]?.[0] : new Date(startTime).toLocaleDateString('sv-SE');
  const start = startTime === null ? parseDate(firstDate) : startTime;
  if (points.length < 2 || start === null) return [];
  return points.map(point => {
    const current = parseDate(point[0]);
    const days = current === null ? 0 : Math.max(0, (current - start) / (24 * 60 * 60 * 1000));
    const value = ((1 + ANNUAL_BENCHMARK / 100) ** (days / 365) - 1) * 100;
    return [point[0], value];
  });
}

function formatDateTick(date, period) {
  const parts = String(date || '').split('-');
  if (parts.length < 3) return date || '';
  if (period === 'm1' || period === 'm3') return `${parts[1]}/${parts[2]}`;
  return `${parts[0].slice(2)}/${parts[1]}`;
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

function formatAxisPercent(value) {
  if (!Number.isFinite(value)) return '-';
  if (Math.abs(value) < 1e-10) return '0%';
  return `${value > 0 ? '+' : ''}${value.toFixed(2)}%`;
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
