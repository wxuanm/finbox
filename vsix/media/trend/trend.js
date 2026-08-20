const vscode = acquireVsCodeApi();

document.getElementById('refreshBtn').addEventListener('click', () => {
  vscode.postMessage({ type: 'refreshTrend' });
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
  const { target, nav, metrics } = payload;
  document.getElementById('title').textContent = target.title;
  setStatus(`数据源 eastmoney · ${formatTime(nav.updatedAt)}${nav.failedCodes.length ? ` · 失败 ${nav.failedCodes.join(', ')}` : ''}`);
  renderSummary(metrics);
  renderChart(metrics);
  renderMetrics(metrics);
}

function renderSummary(metrics) {
  const best = metrics.slice().sort((a, b) => valueOf(b, 'y3', 'returnValue') - valueOf(a, 'y3', 'returnValue'))[0];
  const worstDrawdown = metrics.slice().sort((a, b) => valueOf(a, 'y3', 'maxDrawdown') - valueOf(b, 'y3', 'maxDrawdown'))[0];
  document.getElementById('summary').innerHTML = [
    card('基金数量', String(metrics.length), '有效历史数据'),
    card('三年最佳', best ? formatPercent(valueOf(best, 'y3', 'returnValue')) : '-', best ? `${best.name} ${best.code}` : ''),
    card('最大回撤', worstDrawdown ? formatPercent(valueOf(worstDrawdown, 'y3', 'maxDrawdown')) : '-', worstDrawdown ? `${worstDrawdown.name} ${worstDrawdown.code}` : '')
  ].join('');
}

function renderChart(metrics) {
  const chartEl = document.getElementById('chart');
  if (!metrics.length) {
    chartEl.innerHTML = '<div class="card">暂无可展示数据</div>';
    return;
  }

  const width = 900;
  const height = 340;
  const pad = { left: 54, right: 24, top: 20, bottom: 34 };
  const series = metrics.map(metric => ({ metric, points: metric.chartSeries?.y3 || metric.series || [] })).filter(item => item.points.length > 1);
  const values = series.flatMap(item => item.points.map(point => point[1]));
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 0);
  const span = max - min || 1;
  const x = (index, total) => pad.left + index / Math.max(total - 1, 1) * (width - pad.left - pad.right);
  const y = value => pad.top + (max - value) / span * (height - pad.top - pad.bottom);
  const zeroY = y(0);

  const lines = series.map((item, index) => {
    const d = item.points.map((point, pointIndex) => `${pointIndex === 0 ? 'M' : 'L'} ${x(pointIndex, item.points.length).toFixed(1)} ${y(point[1]).toFixed(1)}`).join(' ');
    return `<path class="line-${index % 10}" d="${d}" fill="none" stroke-width="2"/>`;
  }).join('');

  chartEl.innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="三年历史趋势">
    <line class="axis" x1="${pad.left}" y1="${height - pad.bottom}" x2="${width - pad.right}" y2="${height - pad.bottom}"/>
    <line class="axis" x1="${pad.left}" y1="${pad.top}" x2="${pad.left}" y2="${height - pad.bottom}"/>
    <line class="grid-line" x1="${pad.left}" y1="${zeroY}" x2="${width - pad.right}" y2="${zeroY}"/>
    <text class="chart-label" x="8" y="${y(max) + 4}">${formatPercent(max)}</text>
    <text class="chart-label" x="8" y="${zeroY + 4}">0.00%</text>
    <text class="chart-label" x="8" y="${y(min) + 4}">${formatPercent(min)}</text>
    ${lines}
  </svg>
  <div class="legend">${series.map((item, index) => `<span class="legend-item line-${index % 10}">${escapeHtml(item.metric.name)} ${escapeHtml(item.metric.code)}</span>`).join('')}</div>`;
}

function renderMetrics(metrics) {
  document.getElementById('metrics').innerHTML = metrics.map(metric => {
    const y3 = metric.periods?.y3 || {};
    return `<article class="card">
      <div class="card-title">${escapeHtml(metric.name)} ${escapeHtml(metric.code)}</div>
      <div class="card-value ${classFor(y3.returnValue)}">${formatPercent(y3.returnValue)}</div>
      <div class="card-sub">三年收益 · 回撤 ${formatPercent(y3.maxDrawdown)}</div>
      <div class="card-sub">经理 ${escapeHtml(metric.manager || '-')}</div>
      <div class="card-sub">最新 ${escapeHtml(metric.latestDate || '-')}</div>
    </article>`;
  }).join('');
}

function card(title, value, sub) {
  return `<article class="card"><div class="card-title">${escapeHtml(title)}</div><div class="card-value ${classFor(parseFloat(value))}">${escapeHtml(value)}</div><div class="card-sub">${escapeHtml(sub)}</div></article>`;
}

function valueOf(metric, period, field) {
  const value = metric?.periods?.[period]?.[field];
  return Number.isFinite(value) ? value : -Infinity;
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
