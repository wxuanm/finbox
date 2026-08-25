const vscode = acquireVsCodeApi();
const PERIODS = {
  ytd: '今年',
  m1: '近1月',
  m3: '近3月',
  m6: '近6月',
  y1: '近1年',
  y3: '近3年'
};
const ANNUAL_BENCHMARK = 10;
let currentPayload = null;
let currentPeriod = 'y3';

document.getElementById('refreshBtn').addEventListener('click', () => {
  vscode.postMessage({ type: 'refreshTrend' });
});

document.getElementById('periodTabs').addEventListener('click', event => {
  const target = event.target;
  if (!(target instanceof HTMLButtonElement)) return;
  const period = target.dataset.period;
  if (!period || !PERIODS[period] || period === currentPeriod) return;
  currentPeriod = period;
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
    document.getElementById('chart').innerHTML = '<div class="card">暂无可展示数据</div>';
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
  setStatus(`数据源 eastmoney · ${formatTime(nav.updatedAt)}${nav.failedCodes.length ? ` · 失败 ${nav.failedCodes.join(', ')}` : ''}`);
  updatePeriodTabs();
  renderSummary(metrics, currentPeriod);
  renderChart(metrics, currentPeriod);
  renderMetrics(metrics, currentPeriod);
}

function renderSummary(metrics, period) {
  const validReturns = metrics.filter(metric => Number.isFinite(metricValue(metric, period, 'returnValue')));
  const validDrawdowns = metrics.filter(metric => Number.isFinite(metricValue(metric, period, 'maxDrawdown')));
  const validCalmar = metrics.filter(metric => Number.isFinite(metricValue(metric, period, 'calmarRatio')));
  const best = validReturns.slice().sort((a, b) => metricValue(b, period, 'returnValue') - metricValue(a, period, 'returnValue'))[0];
  const worstDrawdown = validDrawdowns.slice().sort((a, b) => metricValue(a, period, 'maxDrawdown') - metricValue(b, period, 'maxDrawdown'))[0];
  const bestCalmar = validCalmar.slice().sort((a, b) => metricValue(b, period, 'calmarRatio') - metricValue(a, period, 'calmarRatio'))[0];
  const latestDate = metrics.map(metric => metric.latestDate).filter(Boolean).sort().at(-1) || '-';
  document.getElementById('summary').innerHTML = [
    card('分析周期', PERIODS[period], `最新净值日 ${latestDate}`),
    card('收益领先', best ? formatPercent(metricValue(best, period, 'returnValue')) : '-', best ? `${best.name} ${best.code}` : '暂无有效收益'),
    card('最大回撤', worstDrawdown ? formatPercent(metricValue(worstDrawdown, period, 'maxDrawdown')) : '-', worstDrawdown ? `${worstDrawdown.name} ${worstDrawdown.code}` : '暂无回撤数据'),
    card('卡玛比率', bestCalmar ? formatNumber(metricValue(bestCalmar, period, 'calmarRatio')) : '-', bestCalmar ? bestCalmar.name : '收益/最大回撤')
  ].join('');
}

function renderChart(metrics, period) {
  const chartEl = document.getElementById('chart');
  if (!metrics.length) {
    chartEl.innerHTML = '<div class="card">暂无可展示数据</div>';
    return;
  }

  document.getElementById('chartTitle').textContent = `${PERIODS[period]}累计收益走势`;
  document.getElementById('chartHint').textContent = '每条线以周期首个可用净值为 0% 起点，便于横向比较。';

  const width = 900;
  const height = 340;
  const pad = { left: 18, right: 18, top: 20, bottom: 30 };
  const series = metrics.map(metric => ({ metric, points: metric.chartSeries?.[period] || [] })).filter(item => item.points.length > 1);
  if (!series.length) {
    chartEl.innerHTML = '<div class="empty-state">当前周期暂无足够历史数据</div>';
    return;
  }
  const benchmark = buildAnnualBenchmarkSeries(series);
  const values = series.flatMap(item => item.points.map(point => point[1])).concat(benchmark.map(point => point[1]), [0]);
  const { min, max, ticks } = buildYAxisScale(values, 7);
  const span = max - min || 1;
  const plotLeft = pad.left;
  const plotRight = width - pad.right;
  const plotWidth = plotRight - plotLeft;
  const x = (index, total) => plotLeft + index / Math.max(total - 1, 1) * plotWidth;
  const y = value => pad.top + (max - value) / span * (height - pad.top - pad.bottom);
  const gridLines = ticks.map(value => {
    const tickY = y(value);
    const gridClass = value === 0 ? 'grid-line zero-axis' : 'grid-line';
    return `<line class="${gridClass}" x1="${plotLeft}" y1="${tickY}" x2="${plotRight}" y2="${tickY}"/>
      <text class="chart-label" x="${pad.left - 8}" y="${tickY + 4}" text-anchor="end">${formatAxisPercent(value)}</text>
      <text class="chart-label" x="${width - pad.right + 8}" y="${tickY + 4}">${formatAxisPercent(value)}</text>`;
  }).join('');
  const benchmarkPath = benchmark.map((point, index) => `${index === 0 ? 'M' : 'L'} ${x(index, benchmark.length).toFixed(1)} ${y(point[1]).toFixed(1)}`).join(' ');
  const benchmarkEnd = benchmark.at(-1);
  const benchmarkLabelY = benchmarkEnd ? Math.max(pad.top + 12, y(benchmarkEnd[1]) - 6) : pad.top + 12;

  const lines = series.map((item, index) => {
    const d = item.points.map((point, pointIndex) => `${pointIndex === 0 ? 'M' : 'L'} ${x(pointIndex, item.points.length).toFixed(1)} ${y(point[1]).toFixed(1)}`).join(' ');
    return `<path class="line-${index % 10}" d="${d}" fill="none" stroke-width="2"/>`;
  }).join('');
  const hoverPoints = series.map((item, index) => `<circle id="hoverPoint${index}" class="line-${index % 10} hover-point" r="4" cx="0" cy="0" visibility="hidden"/>`).join('');

  chartEl.innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${PERIODS[period]}历史趋势">
    <line class="axis" x1="${plotLeft}" y1="${pad.top}" x2="${plotLeft}" y2="${height - pad.bottom}"/>
    <line class="axis" x1="${plotRight}" y1="${pad.top}" x2="${plotRight}" y2="${height - pad.bottom}"/>
    ${gridLines}
    <path class="benchmark-line" d="${benchmarkPath}" fill="none"/>
    <text class="benchmark-label" x="${plotRight - 6}" y="${benchmarkLabelY}" text-anchor="end">年化10%${benchmarkEnd ? ` ${formatAxisPercent(benchmarkEnd[1])}` : ''}</text>
    ${lines}
    <line id="hoverLine" class="crosshair" x1="0" y1="${pad.top}" x2="0" y2="${height - pad.bottom}" visibility="hidden"/>
    <g>${hoverPoints}</g>
    <rect class="interaction-layer" x="0" y="0" width="${width}" height="${height}"/>
  </svg>
  <div id="chartTooltip" class="chart-tooltip" hidden></div>
  <div class="legend">${series.map((item, index) => `<span class="legend-item line-${index % 10}">${escapeHtml(item.metric.name)} ${escapeHtml(item.metric.code)}</span>`).join('')}</div>`;
  bindChartInteraction(chartEl, series, { width, height, pad, min, max, span });
}

function bindChartInteraction(chartEl, series, dimensions) {
  const svg = chartEl.querySelector('svg');
  const hoverLine = chartEl.querySelector('#hoverLine');
  const tooltip = chartEl.querySelector('#chartTooltip');
  if (!svg || !hoverLine || !tooltip) return;

  const { width, height, pad, min, max, span } = dimensions;
  const chartWidth = width - pad.left - pad.right;
  const chartHeight = height - pad.top - pad.bottom;
  const y = value => pad.top + (max - value) / span * chartHeight;

  const hide = () => {
    hoverLine.setAttribute('visibility', 'hidden');
    tooltip.hidden = true;
    series.forEach((_, index) => chartEl.querySelector(`#hoverPoint${index}`)?.setAttribute('visibility', 'hidden'));
  };

  svg.onmouseleave = hide;
  svg.onmousemove = event => {
    const svgPoint = getSvgPoint(svg, event);
    if (!svgPoint) {
      hide();
      return;
    }

    const svgX = svgPoint.x;
    const svgY = svgPoint.y;
    if (svgX < pad.left || svgX > width - pad.right || svgY < pad.top || svgY > height - pad.bottom) {
      hide();
      return;
    }

    const ratio = (svgX - pad.left) / chartWidth;
    const selected = series.map((item, index) => {
      const pointIndex = Math.min(item.points.length - 1, Math.max(0, Math.round(ratio * (item.points.length - 1))));
      const point = item.points[pointIndex];
      const pointX = pad.left + pointIndex / Math.max(item.points.length - 1, 1) * chartWidth;
      const pointY = y(point[1]);
      const marker = chartEl.querySelector(`#hoverPoint${index}`);
      marker?.setAttribute('cx', pointX.toFixed(1));
      marker?.setAttribute('cy', pointY.toFixed(1));
      marker?.setAttribute('visibility', 'visible');
      return { item, point };
    });

    const hoverX = svgX;
    hoverLine.setAttribute('x1', hoverX.toFixed(1));
    hoverLine.setAttribute('x2', hoverX.toFixed(1));
    hoverLine.setAttribute('visibility', 'visible');

    const date = selected[0]?.point?.[0] || '';
    tooltip.innerHTML = `<div class="tooltip-date">${escapeHtml(date)}</div>${selected.map(({ item, point }, index) => `
      <div class="tooltip-row line-${index % 10}">
        <span class="tooltip-name">${escapeHtml(item.metric.name)} ${escapeHtml(item.metric.code)}</span>
        <strong class="tooltip-value ${classFor(point[1])}">${formatPercent(point[1])}</strong>
      </div>`).join('')}`;
    tooltip.hidden = false;

    const chartRect = chartEl.getBoundingClientRect();
    const localX = event.clientX - chartRect.left;
    const localY = event.clientY - chartRect.top;
    const tooltipWidth = tooltip.offsetWidth || 240;
    const tooltipHeight = tooltip.offsetHeight || 120;
    const left = localX + tooltipWidth + 28 > chartEl.clientWidth
      ? Math.max(8, localX - tooltipWidth - 14)
      : Math.min(chartEl.clientWidth - tooltipWidth - 8, Math.max(8, localX + 14));
    const top = Math.min(chartEl.clientHeight - tooltipHeight - 8, Math.max(8, localY + 14));
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
  };
}

function getSvgPoint(svg, event) {
  const matrix = svg.getScreenCTM();
  if (!matrix) return null;
  const point = svg.createSVGPoint();
  point.x = event.clientX;
  point.y = event.clientY;
  return point.matrixTransform(matrix.inverse());
}

function renderMetrics(metrics, period) {
  document.getElementById('metrics').innerHTML = metrics.map(metric => {
    const current = metric.periods?.[period] || {};
    return `<article class="card">
      <div class="card-title">${escapeHtml(metric.name)} ${escapeHtml(metric.code)}</div>
      <div class="card-value ${classFor(current.returnValue)}">${formatPercent(current.returnValue)}</div>
      <div class="metric-row"><span>最大回撤</span><strong class="${classFor(current.maxDrawdown)}">${formatPercent(current.maxDrawdown)}</strong></div>
      <div class="metric-row"><span>年化波动</span><strong>${formatPercent(current.annualizedVolatility)}</strong></div>
      <div class="metric-row"><span>卡玛比率</span><strong>${formatNumber(current.calmarRatio)}</strong></div>
      <div class="metric-row"><span>上涨日占比</span><strong>${formatPercent(current.upDayRatio)}</strong></div>
      <div class="card-sub">规模 ${formatScale(metric.scale)} · 最新 ${escapeHtml(metric.latestDate || '-')}</div>
      <div class="card-sub">经理 ${escapeHtml(metric.manager || '-')}</div>
    </article>`;
  }).join('');
}

function card(title, value, sub) {
  return `<article class="card"><div class="card-title">${escapeHtml(title)}</div><div class="card-value ${classFor(parseFloat(value))}">${escapeHtml(value)}</div><div class="card-sub">${escapeHtml(sub)}</div></article>`;
}

function metricValue(metric, period, field) {
  const value = metric?.periods?.[period]?.[field];
  return Number.isFinite(value) ? value : null;
}

function buildAnnualBenchmarkSeries(series) {
  const points = series[0]?.points || [];
  const firstDate = points[0]?.[0];
  const start = parseDate(firstDate);
  if (points.length < 2 || start === null) return [];
  return points.map(point => {
    const current = parseDate(point[0]);
    const days = current === null ? 0 : Math.max(0, (current - start) / (24 * 60 * 60 * 1000));
    const value = ((1 + ANNUAL_BENCHMARK / 100) ** (days / 365) - 1) * 100;
    return [point[0], value];
  });
}

function parseDate(date) {
  const time = new Date(`${date}T00:00:00`).getTime();
  return Number.isFinite(time) ? time : null;
}

function buildYAxisScale(values, targetTickCount) {
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const range = rawMax - rawMin || 1;
  const paddedMin = rawMin < 0 ? rawMin - range * 0.08 : 0;
  const paddedMax = rawMax > 0 ? rawMax + range * 0.08 : 0;
  const step = niceStep((paddedMax - paddedMin || 1) / Math.max(targetTickCount - 1, 1));
  const min = paddedMin < 0 ? Math.floor(paddedMin / step) * step : 0;
  const max = paddedMax > 0 ? Math.ceil(paddedMax / step) * step : 0;
  const ticks = [];
  for (let value = max; value >= min - step / 2; value -= step) {
    ticks.push(Math.abs(value) < 1e-10 ? 0 : value);
  }
  if (!ticks.includes(0)) ticks.push(0);
  ticks.sort((a, b) => b - a);
  return { min, max, ticks };
}

function niceStep(roughStep) {
  const magnitude = 10 ** Math.floor(Math.log10(roughStep));
  const normalized = roughStep / magnitude;
  return (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10) * magnitude;
}

function updatePeriodTabs() {
  document.querySelectorAll('#periodTabs button').forEach(button => {
    button.classList.toggle('active', button.dataset.period === currentPeriod);
  });
}

function setStatus(text) {
  document.getElementById('status').textContent = text;
}

function formatTime(value) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString('zh-CN') : '-';
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

function formatScale(scale) {
  if (!scale || !Number.isFinite(scale.value)) return '-';
  return `${scale.value.toFixed(2)}亿${scale.date ? ` · ${scale.date}` : ''}`;
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
