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
let currentPayload = null;
let currentPeriod = 'm3';
let currentViewMode = 'chart';
let currentListPage = 1;
let selectedFundCode = null;

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
    chartEl.innerHTML = '<div class="card">暂无可展示数据</div>';
    return;
  }

  document.getElementById('chartTitle').textContent = `${PERIODS[period]}累计收益走势`;

  const width = 900;
  const height = 340;
  const pad = { left: 24, right: 24, top: 20, bottom: 42 };
  const visibleMetrics = selectedFundCode ? metrics.filter(metric => metric.code === selectedFundCode) : metrics;
  const series = visibleMetrics.map(metric => ({ metric, points: metric.chartSeries?.[period] || [] })).filter(item => item.points.length > 1);
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
      <text class="chart-label chart-label-inside" x="${plotRight - 4}" y="${tickY + 4}" text-anchor="end">${formatAxisPercent(value)}</text>`;
  }).join('');
  const xLabels = buildXAxisLabels(series[0].points, 12).map(item => {
    const labelX = x(item.index, series[0].points.length);
    const anchor = item.index === 0 ? 'start' : item.index === series[0].points.length - 1 ? 'end' : 'middle';
    return `<line class="axis-tick" x1="${labelX}" y1="${height - pad.bottom}" x2="${labelX}" y2="${height - pad.bottom + 4}"/>
      <text class="chart-label x-axis-label" x="${labelX}" y="${height - pad.bottom + 18}" text-anchor="${anchor}">${escapeHtml(formatDateTick(item.date, period))}</text>`;
  }).join('');
  const benchmarkPath = benchmark.map((point, index) => `${index === 0 ? 'M' : 'L'} ${x(index, benchmark.length).toFixed(1)} ${y(point[1]).toFixed(1)}`).join(' ');

  const lines = series.map((item, index) => {
    const d = item.points.map((point, pointIndex) => `${pointIndex === 0 ? 'M' : 'L'} ${x(pointIndex, item.points.length).toFixed(1)} ${y(point[1]).toFixed(1)}`).join(' ');
    return `<path class="line-${index % 10}" d="${d}" fill="none" stroke-width="2"/>`;
  }).join('');
  const drawdownLines = series.length === 1 ? buildDrawdownPath(series[0], period, x, y) : '';
  const hoverPoints = series.map((item, index) => `<circle id="hoverPoint${index}" class="line-${index % 10} hover-point" r="4" cx="0" cy="0" visibility="hidden"/>`).join('');

  chartEl.innerHTML = `<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-label="${PERIODS[period]}历史趋势">
    <line class="axis" x1="${plotRight}" y1="${pad.top}" x2="${plotRight}" y2="${height - pad.bottom}"/>
    <line class="axis" x1="${plotLeft}" y1="${height - pad.bottom}" x2="${plotRight}" y2="${height - pad.bottom}"/>
    ${gridLines}
    ${xLabels}
    <path class="benchmark-line" d="${benchmarkPath}" fill="none"/>
    ${lines}
    ${drawdownLines}
    <line id="hoverLine" class="crosshair" x1="0" y1="${pad.top}" x2="0" y2="${height - pad.bottom}" visibility="hidden"/>
    <g>${hoverPoints}</g>
    <rect class="interaction-layer" x="0" y="0" width="${width}" height="${height}"/>
  </svg>
  <div id="chartTooltip" class="chart-tooltip" hidden></div>
  <div class="legend">${series.map((item, index) => `<span class="legend-item line-${index % 10}">${escapeHtml(item.metric.name)} ${escapeHtml(item.metric.code)}</span>`).join('')}</div>`;
  bindChartInteraction(chartEl, series, { width, height, pad, min, max, span });
}

function renderNavList(metric, period) {
  const chartEl = document.getElementById('chart');
  const listEl = document.getElementById('navList');
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

function buildDrawdownPath(item, period, x, y) {
  const startDate = item.metric.periods?.[period]?.maxDrawdownStartDate;
  const endDate = item.metric.periods?.[period]?.maxDrawdownEndDate;
  const maxDrawdown = item.metric.periods?.[period]?.maxDrawdown;
  if (!startDate || !endDate || startDate === endDate || !Number.isFinite(maxDrawdown) || maxDrawdown >= 0) return '';

  const startIndex = item.points.findIndex(point => point[0] === startDate);
  const endIndex = item.points.findIndex(point => point[0] === endDate);
  if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) return '';

  const points = item.points.slice(startIndex, endIndex + 1);
  if (points.length < 2) return '';

  const d = points.map((point, offset) => {
    const pointIndex = startIndex + offset;
    return `${offset === 0 ? 'M' : 'L'} ${x(pointIndex, item.points.length).toFixed(1)} ${y(point[1]).toFixed(1)}`;
  }).join(' ');
  return `<path class="drawdown-line" d="${d}" fill="none"/>`;
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
        <div class="tooltip-main">
          <span class="tooltip-name">${escapeHtml(item.metric.name)} ${escapeHtml(item.metric.code)}</span>
          <strong class="tooltip-value ${classFor(point[1])}">累计 ${formatPercent(point[1])}</strong>
        </div>
        ${selected.length === 1 ? `<div class="tooltip-detail">
          <span>净值 ${formatNav(point[2])}</span>
          <span class="${classFor(point[4])}">日涨幅 ${formatPercent(point[4])}</span>
        </div>` : ''}
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

function buildXAxisLabels(points, count) {
  if (!points.length) return [];
  const maxIndex = points.length - 1;
  const labels = [];
  for (let index = 0; index < count; index += 1) {
    const pointIndex = Math.round(index / Math.max(count - 1, 1) * maxIndex);
    const point = points[pointIndex];
    if (point) labels.push({ index: pointIndex, date: point[0] });
  }
  return labels.filter((item, index, items) => items.findIndex(candidate => candidate.index === item.index) === index);
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
