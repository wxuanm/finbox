import { state } from '../config/state.js';
import { i18n } from '../config/i18n.js';
import { formatRet } from '../utils/formatter.js';
import { fetchThreeYearFundNav } from '../api/fundNavApi.js';
import { buildNavMetrics } from '../utils/navMetrics.js';

let compareSortKey = '';
let compareSortOrder = 1;
let mobileCompareSortKey = '';
let mobileCompareSortOrder = 1;
const defaultMobileSortKey = 'y1';
let modalRequestSeq = 0;
const defaultNavChartPeriod = 'y3';
const navBenchmarkAnnualReturn = 0.1;
const dayMs = 24 * 60 * 60 * 1000;
const maxDrawdownSeriesName = '__max_drawdown_segment__';
const navChartLineWidth = 2.5;
const navChartFocusedLineWidth = 3.2;
const navChartDrawdownLineWidth = 2.6;
const navChartBenchmarkLineWidth = 1.5;
let selectedNavFundCode = '';

function parseReturnValue(value) {
    if (!value || value === '---' || value === 'N/A') return -Infinity;
    const num = parseFloat(String(value).replace('%', ''));
    return Number.isNaN(num) ? -Infinity : num;
}

function sortCompareRows(rows, key) {
    if (compareSortKey === key) {
        compareSortOrder *= -1;
    } else {
        compareSortKey = key;
        compareSortOrder = 1;
    }

    rows.sort((a, b) => {
        if (key === 'name') {
            return `${a.name}${a.fundCode}`.localeCompare(`${b.name}${b.fundCode}`, state.currentLang === 'zh' ? 'zh-CN' : 'en', { numeric: true }) * compareSortOrder;
        }

        return (parseReturnValue(a[key]) - parseReturnValue(b[key])) * compareSortOrder;
    });
}

function applyCompareSort(rows, key, order) {
    rows.sort((a, b) => {
        if (key === 'name') {
            return `${a.name}${a.fundCode}`.localeCompare(`${b.name}${b.fundCode}`, state.currentLang === 'zh' ? 'zh-CN' : 'en', { numeric: true }) * order;
        }

        return (parseReturnValue(a[key]) - parseReturnValue(b[key])) * order;
    });
}

function updateCompareSortIcons() {
    document.querySelectorAll('.analysis-compare-table th[data-compare-sort]').forEach(header => {
        const icon = header.querySelector('.sort-icon');
        if (!icon) return;
        icon.textContent = header.dataset.compareSort === compareSortKey ? (compareSortOrder === 1 ? '▲' : '▼') : '';
    });
}

function renderCompareRows(rows, comparisonColumns) {
    return rows.map(row => `
        <tr>
            <td>
                <div class="compare-fund-name">
                    <strong>${row.name}</strong>
                    <span>${row.fundCode}</span>
                </div>
            </td>
            ${comparisonColumns.map(([, key]) => `<td>${formatRet(row[key])}</td>`).join('')}
        </tr>
    `).join('');
}

function bindCompareSorting(rows, comparisonColumns) {
    const table = document.querySelector('.analysis-compare-table');
    if (!table) return;

    table.querySelectorAll('th[data-compare-sort]').forEach(header => {
        header.addEventListener('click', () => {
            sortCompareRows(rows, header.dataset.compareSort);
            table.querySelector('tbody').innerHTML = renderCompareRows(rows, comparisonColumns);
            updateCompareSortIcons();
        });
    });
}

function renderMobileCompareCards(rows, primaryColumn, defaultColumns, moreColumns, dict) {
    const [primaryLabel, primaryKey] = primaryColumn;
    return rows.map((row, index) => `
        <section class="compare-mobile-card">
            <div class="compare-mobile-head">
                <div class="compare-mobile-title">
                    <strong>${row.name}</strong>
                    <span>${row.fundCode}</span>
                </div>
                <div class="compare-mobile-primary">
                    <span>#${index + 1} ${dict[primaryLabel]}</span>
                    ${formatRet(row[primaryKey])}
                </div>
            </div>
            <div class="compare-mobile-grid">
                ${defaultColumns.map(([label, key]) => `
                    <div class="compare-mobile-item"><span>${dict[label]}</span>${formatRet(row[key])}</div>
                `).join('')}
            </div>
            <details class="compare-mobile-more">
                <summary>${i18n[state.currentLang].morePeriods}</summary>
                <div class="compare-mobile-grid">
                    ${moreColumns.map(([label, key]) => `
                        <div class="compare-mobile-item"><span>${dict[label]}</span>${formatRet(row[key])}</div>
                    `).join('')}
                </div>
            </details>
        </section>
    `).join('');
}

function formatPercentValue(value) {
    if (!Number.isFinite(value)) return '-';
    const className = value > 0 ? 'positive' : value < 0 ? 'negative' : 'neutral';
    return `<span class="${className}">${value.toFixed(2)}%</span>`;
}

function formatNumberValue(value) {
    if (!Number.isFinite(value)) return '-';
    const className = value > 1 ? 'positive' : value < 0 ? 'negative' : 'neutral';
    return `<span class="${className}">${value.toFixed(2)}</span>`;
}

function getMetricHighlightClasses(values, preferLow = false) {
    const finiteValues = values.filter(Number.isFinite);
    if (finiteValues.length < 2) return values.map(() => '');

    const bestValue = preferLow ? Math.min(...finiteValues) : Math.max(...finiteValues);
    const worstValue = preferLow ? Math.max(...finiteValues) : Math.min(...finiteValues);
    if (bestValue === worstValue) return values.map(() => '');

    return values.map(value => {
        if (!Number.isFinite(value)) return '';
        if (value === bestValue) return ' best';
        if (value === worstValue) return ' worst';
        return '';
    });
}

function getMetricHighlightGrid(metrics, items, getValue, preferLow = false) {
    const grid = metrics.map(() => items.map(() => ''));

    items.forEach(([, key], itemIndex) => {
        const classes = getMetricHighlightClasses(metrics.map(metric => getValue(metric, key)), preferLow);
        classes.forEach((className, metricIndex) => {
            grid[metricIndex][itemIndex] = className;
        });
    });

    return grid;
}

function renderNavMetricCards(metrics) {
    const dict = i18n[state.currentLang];
    const periodItems = [
        ['periodShort1w', 'w1'],
        ['periodShort1m', 'm1'],
        ['periodShort3m', 'm3'],
        ['periodShort6m', 'm6'],
        ['periodShort1y', 'y1'],
        ['periodShort3y', 'y3']
    ];
    const qualityItems = [
        ['periodShort3m', 'm3'],
        ['periodShort6m', 'm6'],
        ['periodShort1y', 'y1'],
        ['periodShort3y', 'y3']
    ];
    const returnHighlights = getMetricHighlightGrid(metrics, periodItems, (metric, key) => metric.periods?.[key]?.returnValue);
    const drawdownHighlights = getMetricHighlightGrid(metrics, periodItems, (metric, key) => metric.periods?.[key]?.maxDrawdown);
    const volatilityHighlights = getMetricHighlightGrid(metrics, qualityItems, (metric, key) => metric.periods?.[key]?.annualizedVolatility, true);
    const calmarHighlights = getMetricHighlightGrid(metrics, qualityItems, (metric, key) => metric.periods?.[key]?.calmarRatio);
    const upDayHighlights = getMetricHighlightGrid(metrics, qualityItems, (metric, key) => metric.periods?.[key]?.upDayRatio);

    return metrics.map((metric, metricIndex) => {
        return `
        <div class="nav-metric-card" data-nav-fund-code="${metric.code}" role="button" tabindex="0" aria-pressed="false">
            <div class="nav-metric-name">
                <strong>${metric.name}</strong>
                <span>${formatNavFundCardMeta(metric)}</span>
            </div>
            <div class="nav-period-metric-table">
                <div class="nav-period-metric-row nav-period-metric-header">
                    <span>${dict.navPeriodRange}</span>
                    <span>${dict.navPeriodReturn}</span>
                    <span>${dict.navMaxDrawdown}</span>
                </div>
                ${periodItems.map(([label, key], index) => `
                    <div class="nav-period-metric-row">
                        <strong>${dict[label]}</strong>
                        <div class="nav-highlight-cell${returnHighlights[metricIndex][index]}">${formatPercentValue(metric.periods?.[key]?.returnValue)}</div>
                        <div class="nav-highlight-cell${drawdownHighlights[metricIndex][index]}">${formatPercentValue(metric.periods?.[key]?.maxDrawdown)}</div>
                    </div>
                `).join('')}
            </div>
            <div class="nav-quality-metrics">
                <div class="nav-quality-title">${dict.navQualityTitle}</div>
                <div class="nav-quality-row nav-quality-header">
                    <span>${dict.navPeriodRange}</span>
                    <span>${dict.navAnnualizedVolatility}</span>
                    <span>${dict.navCalmarRatio}</span>
                    <span>${dict.navUpDayRatio}</span>
                </div>
                ${qualityItems.map(([label, key], index) => `
                    <div class="nav-quality-row">
                        <strong>${dict[label]}</strong>
                        <div class="nav-highlight-cell${volatilityHighlights[metricIndex][index]}">
                            ${formatPercentValue(metric.periods?.[key]?.annualizedVolatility)}
                        </div>
                        <div class="nav-highlight-cell${calmarHighlights[metricIndex][index]}">
                            ${formatNumberValue(metric.periods?.[key]?.calmarRatio)}
                        </div>
                        <div class="nav-highlight-cell${upDayHighlights[metricIndex][index]}">
                            ${formatPercentValue(metric.periods?.[key]?.upDayRatio)}
                        </div>
                    </div>
                `).join('')}
            </div>
            <div class="nav-metric-footer">
                <span>${dict.navLatestDate}</span>
                <strong>${metric.latestDate || '-'}</strong>
            </div>
        </div>
        `;
    }).join('');
}

function formatNavFundCardMeta(metric) {
    const dict = i18n[state.currentLang];
    const meta = [metric.code];
    if (metric.manager) meta.push(metric.manager);
    if (Number.isFinite(metric.scale?.value)) {
        meta.push(`${metric.scale.value.toFixed(2)}${dict.navFundScaleUnit}`);
    }

    return meta.join(' · ');
}

function formatNavFundName(metric) {
    return `${metric.name} ${metric.code}`;
}

function renderNavSummary(metrics, periodKey = defaultNavChartPeriod) {
    const dict = i18n[state.currentLang];
    const periodLabels = {
        ytd: dict.periodYtd,
        m1: dict.period1m,
        m3: dict.period3m,
        m6: dict.period6m,
        y1: dict.period1y,
        y3: dict.period3y
    };
    const validMetrics = metrics.filter(metric => Number.isFinite(metric.periods?.[periodKey]?.returnValue));
    const validDrawdowns = metrics.filter(metric => Number.isFinite(metric.periods?.[periodKey]?.maxDrawdown));
    const best = validMetrics.reduce((current, metric) => {
        if (!current) return metric;
        return metric.periods[periodKey].returnValue > current.periods[periodKey].returnValue ? metric : current;
    }, null);
    const worst = validMetrics.reduce((current, metric) => {
        if (!current) return metric;
        return metric.periods[periodKey].returnValue < current.periods[periodKey].returnValue ? metric : current;
    }, null);
    const deepestDrawdown = validDrawdowns.reduce((current, metric) => {
        if (!current) return metric;
        return metric.periods[periodKey].maxDrawdown < current.periods[periodKey].maxDrawdown ? metric : current;
    }, null);
    const latestDate = metrics.reduce((latest, metric) => {
        if (!metric.latestDate) return latest;
        return !latest || metric.latestDate > latest ? metric.latestDate : latest;
    }, '');

    const cards = [
        {
            label: `${periodLabels[periodKey] || dict.period1y}${dict.navBestPerformer}`,
            metric: best,
            value: best ? formatPercentValue(best.periods[periodKey].returnValue) : '-',
            className: 'best'
        },
        {
            label: `${periodLabels[periodKey] || dict.period1y}${dict.navWorstPerformer}`,
            metric: worst,
            value: worst ? formatPercentValue(worst.periods[periodKey].returnValue) : '-',
            className: 'worst'
        },
        {
            label: `${periodLabels[periodKey] || dict.period1y}${dict.navDeepestDrawdown}`,
            metric: deepestDrawdown,
            value: deepestDrawdown ? formatPercentValue(deepestDrawdown.periods[periodKey].maxDrawdown) : '-',
            className: 'drawdown'
        },
        {
            label: dict.navLatestDataDate,
            metric: null,
            value: latestDate || '-',
            className: 'date'
        }
    ];

    return cards.map(card => `
        <div class="nav-summary-card nav-summary-card-${card.className}">
            <span>${card.label}</span>
            <strong>${card.value}</strong>
            <small>${card.metric ? formatNavFundName(card.metric) : dict.navAllFunds}</small>
        </div>
    `).join('');
}

function updateNavSummary(metrics, periodKey = defaultNavChartPeriod) {
    const summaryEl = document.getElementById('oneYearNavSummary');
    if (!summaryEl) return;
    summaryEl.innerHTML = renderNavSummary(metrics, periodKey);
}

function getLowestSeriesPoint(seriesData) {
    return (seriesData || []).reduce((lowest, point) => {
        const value = Number(point?.[1]);
        if (!Number.isFinite(value)) return lowest;
        if (!lowest || value < lowest[1]) return [point[0], value];
        return lowest;
    }, null);
}

function getHighestSeriesPoint(seriesData) {
    return (seriesData || []).reduce((highest, point) => {
        const value = Number(point?.[1]);
        if (!Number.isFinite(value)) return highest;
        if (!highest || value > highest[1]) return [point[0], value];
        return highest;
    }, null);
}

function getLastSeriesPoint(seriesData) {
    for (let index = (seriesData || []).length - 1; index >= 0; index -= 1) {
        const point = seriesData[index];
        const value = Number(point?.[1]);
        if (Number.isFinite(value)) return [point[0], value];
    }

    return null;
}

function getMaxDrawdownSegment(seriesData) {
    if (!Array.isArray(seriesData) || seriesData.length < 2) return [];

    let peakIndex = -1;
    let peakValue = -Infinity;
    let segmentStartIndex = -1;
    let segmentEndIndex = -1;
    let maxDrawdown = 0;

    seriesData.forEach((point, index) => {
        const returnValue = Number(point?.[1]);
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
    return seriesData.slice(segmentStartIndex, segmentEndIndex + 1);
}

function buildAnnualBenchmarkSeries(chartSeries, startTimeOverride = null) {
    const dates = [...new Set(chartSeries.flatMap(series => (series.data || []).map(point => point?.[0]).filter(Boolean)))].sort();
    if (dates.length < 2) return [];

    const startTime = Number.isFinite(startTimeOverride) ? startTimeOverride : parseChartDate(dates[0]);
    if (startTime === null) return [];

    return dates.map(date => {
        const pointTime = parseChartDate(date);
        if (pointTime === null) return null;

        const elapsedDays = Math.max(0, (pointTime - startTime) / dayMs);
        const returnValue = ((1 + navBenchmarkAnnualReturn) ** (elapsedDays / 365) - 1) * 100;
        return [date, returnValue];
    }).filter(Boolean);
}

function returnPercentToValue(returnValue) {
    return 1 + (Number(returnValue) || 0) / 100;
}

function getNavZoomBounds(metrics, periodKey, zoomRange) {
    if (!zoomRange) return null;

    const times = metrics
        .flatMap(metric => (metric.series || []).map(point => parseChartDate(point?.[0])))
        .filter(time => time !== null)
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

function buildNavZoomRange(metrics, periodKey) {
    const times = metrics
        .flatMap(metric => (metric.series || []).map(point => parseChartDate(point?.[0])))
        .filter(time => time !== null)
        .sort((a, b) => a - b);
    const firstTime = times[0];
    const lastTime = times[times.length - 1];
    if (!Number.isFinite(firstTime) || !Number.isFinite(lastTime) || firstTime >= lastTime) return {};

    const startTime = periodKey === 'ytd'
        ? new Date(new Date(lastTime).getFullYear(), 0, 1).getTime()
        : lastTime - getNavPeriodDays(periodKey) * dayMs;
    const clampedStart = Math.max(firstTime, startTime);
    return {
        start: Math.max(0, Math.min(100, (clampedStart - firstTime) / (lastTime - firstTime) * 100)),
        end: 100
    };
}

function getNavPeriodDays(periodKey) {
    if (periodKey === 'm1') return 30;
    if (periodKey === 'm3') return 90;
    if (periodKey === 'm6') return 180;
    if (periodKey === 'y1') return 365;
    return 365 * 3;
}

function findNavBasePoint(seriesData, startTime) {
    let fallback = null;
    for (const point of seriesData || []) {
        const time = parseChartDate(point?.[0]);
        if (time === null) continue;
        if (time >= startTime) return point;
        fallback = point;
    }
    return fallback;
}

function rebaseNavSeriesData(seriesData, zoomBounds) {
    if (!zoomBounds) return seriesData;

    const basePoint = findNavBasePoint(seriesData, zoomBounds.startTime);
    if (!basePoint) return seriesData;

    const baseValue = returnPercentToValue(basePoint[1]);
    if (!Number.isFinite(baseValue) || baseValue <= 0) return seriesData;

    return (seriesData || []).map(point => [
        point[0],
        (returnPercentToValue(point[1]) / baseValue - 1) * 100
    ]);
}

function filterNavSeriesByZoom(seriesData, zoomBounds) {
    if (!zoomBounds) return seriesData;

    return (seriesData || []).filter(point => {
        const time = parseChartDate(point?.[0]);
        return time !== null && time >= zoomBounds.startTime && time <= zoomBounds.endTime;
    });
}

function parseChartDate(date) {
    const time = new Date(`${date}T00:00:00`).getTime();
    return Number.isFinite(time) ? time : null;
}

function buildNavChartSeries(metrics, periodKey, markerFundCode = selectedNavFundCode, focusFundCode = selectedNavFundCode, zoomBounds = null) {
    return metrics.map(metric => {
        const seriesData = rebaseNavSeriesData(metric.series, zoomBounds);
        const visibleSeriesData = filterNavSeriesByZoom(seriesData, zoomBounds);
        const focused = focusFundCode === metric.code;
        const showReturnMarkers = metrics.length === 1 || markerFundCode === metric.code;
        const lowPoint = getLowestSeriesPoint(visibleSeriesData);
        const highPoint = showReturnMarkers ? getHighestSeriesPoint(visibleSeriesData) : null;
        const lastPoint = showReturnMarkers ? getLastSeriesPoint(visibleSeriesData) : null;
        const markPointData = [];

        if (lowPoint) {
            markPointData.push({
                name: '',
                coord: lowPoint,
                value: lowPoint[1],
                label: { position: 'bottom' }
            });
        }

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
            name: formatNavFundName(metric),
            type: 'line',
            showSymbol: false,
            smooth: false,
            emphasis: { focus: 'none' },
            lineStyle: {
                width: focused ? navChartFocusedLineWidth : navChartLineWidth,
                opacity: !focusFundCode || focused ? 1 : 0.18
            },
            z: focused ? 10 : 1,
            data: seriesData,
            markPoint: markPointData.length > 0 ? {
                symbol: 'circle',
                symbolSize: focused ? 10 : 8,
                itemStyle: {
                    opacity: showReturnMarkers ? 1 : 0
                },
                label: {
                    formatter: params => `${Number(params.value).toFixed(2)}%`,
                    color: getComputedStyle(document.documentElement).getPropertyValue('--secondary-color').trim() || '#0f172a',
                    fontSize: 10,
                    fontWeight: 800,
                    opacity: showReturnMarkers ? 1 : 0
                },
                data: markPointData
            } : undefined
        };
    });
}

function buildSingleFundMaxDrawdownSeries(metrics, periodKey, zoomBounds = null) {
    if (metrics.length !== 1) return [];

    const metric = metrics[0];
    const seriesData = rebaseNavSeriesData(metric.series, zoomBounds);
    const drawdownData = getMaxDrawdownSegment(filterNavSeriesByZoom(seriesData, zoomBounds));
    if (drawdownData.length < 2) return [];

    const drawdownColor = getComputedStyle(document.documentElement).getPropertyValue('--negative-color').trim() || '#10b981';

    return [{
        name: maxDrawdownSeriesName,
        type: 'line',
        showSymbol: false,
        smooth: false,
        silent: true,
        tooltip: { show: false },
        lineStyle: {
            width: navChartDrawdownLineWidth,
            color: drawdownColor,
            opacity: 1
        },
        itemStyle: { color: drawdownColor },
        emphasis: { disabled: true },
        z: 12,
        data: drawdownData
    }];
}

function getActiveNavChartPeriod() {
    return document.querySelector('.nav-chart-range-chip.active')?.dataset.navChartPeriod || defaultNavChartPeriod;
}

function updateNavMetricSelection() {
    document.querySelectorAll('.nav-metric-card[data-nav-fund-code]').forEach(card => {
        const active = Boolean(selectedNavFundCode && card.dataset.navFundCode === selectedNavFundCode);
        card.classList.toggle('active', active);
        card.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
}

function bindNavMetricSelection(metrics) {
    document.querySelectorAll('.nav-metric-card[data-nav-fund-code]').forEach(card => {
        const toggleSelection = () => {
            selectedNavFundCode = selectedNavFundCode === card.dataset.navFundCode ? '' : card.dataset.navFundCode;
            updateNavMetricSelection();
            renderNavChart(metrics, getActiveNavChartPeriod());
        };

        card.addEventListener('click', toggleSelection);
        card.addEventListener('keydown', event => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            toggleSelection();
        });
    });
}

function renderNavChart(metrics, periodKey = defaultNavChartPeriod) {
    const chartEl = document.getElementById('oneYearNavChart');
    if (!chartEl || typeof window.echarts === 'undefined') return;

    const dict = i18n[state.currentLang];
    const existingChart = window.echarts.getInstanceByDom(chartEl);
    if (existingChart) existingChart.dispose();

    const chart = window.echarts.init(chartEl);
    const chartContext = {
        chart,
        metrics,
        periodKey,
        benchmarkName: dict.navBenchmarkAnnual10,
        zoomRange: buildNavZoomRange(metrics, periodKey)
    };
    const chartParts = buildNavChartParts(chartContext);

    chart.setOption({
        color: ['#2563eb', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#84cc16', '#f97316', '#ec4899', '#64748b'],
        tooltip: {
            trigger: 'axis',
            formatter: params => {
                const items = (Array.isArray(params) ? params : [params])
                    .filter(item => item.seriesName !== benchmarkName && item.seriesName !== '__axis_mirror__' && item.seriesName !== maxDrawdownSeriesName);
                if (items.length === 0) return '';

                const title = items[0].axisValueLabel || items[0].axisValue || '';
                const rows = items.map(item => {
                    const value = Number(Array.isArray(item.value) ? item.value[1] : item.value);
                    return `
                        <div style="display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:8px;align-items:center;min-width:220px;">
                            <span>${item.marker}</span>
                            <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${item.seriesName}</span>
                            <span style="font-variant-numeric:tabular-nums;text-align:right;">${Number.isFinite(value) ? value.toFixed(2) : '-'}%</span>
                        </div>
                    `;
                }).join('');
                return `<div style="font-weight:700;margin-bottom:6px;">${title}</div>${rows}`;
            }
        },
        legend: {
            type: 'scroll',
            top: 0,
            data: chartParts.chartSeries.map(series => series.name),
            textStyle: { color: getComputedStyle(document.documentElement).getPropertyValue('--text-color').trim() || '#111827' }
        },
        grid: { top: 42, right: 48, bottom: 64, left: 48 },
        xAxis: { type: 'time', boundaryGap: false },
        yAxis: [
            {
                type: 'value',
                axisLabel: { formatter: '{value}%' },
                splitLine: { lineStyle: { color: getComputedStyle(document.documentElement).getPropertyValue('--border-color').trim() || '#e5e7eb' } }
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
        dataZoom: [
            { id: 'nav-inside-zoom', type: 'inside', throttle: 60, ...chartContext.zoomRange },
            {
                id: 'nav-slider-zoom',
                type: 'slider',
                ...chartContext.zoomRange,
                height: 26,
                bottom: 16,
                borderColor: getComputedStyle(document.documentElement).getPropertyValue('--border-color').trim() || '#e5e7eb',
                backgroundColor: getComputedStyle(document.documentElement).getPropertyValue('--surface-color').trim() || 'transparent',
                fillerColor: getComputedStyle(document.documentElement).getPropertyValue('--primary-soft').trim() || 'rgba(79, 70, 229, 0.16)',
                handleStyle: { color: getComputedStyle(document.documentElement).getPropertyValue('--primary-color').trim() || '#4f46e5' },
                textStyle: { color: getComputedStyle(document.documentElement).getPropertyValue('--muted-text').trim() || '#64748b' }
            }
        ],
        series: chartParts.series
    });

    const updateMarkerFocus = (markerFundCode, focusFundCode = markerFundCode) => {
        const focusedParts = buildNavChartParts(chartContext, markerFundCode, focusFundCode);
        chart.setOption({
            series: focusedParts.series
        }, false);
    };

    chart.on('mouseover', params => {
        if (params.componentType !== 'legend') return;
        const metric = metrics.find(item => formatNavFundName(item) === params.name);
        if (!metric) return;
        updateMarkerFocus(metric.code, metric.code);
    });

    chart.on('mouseout', params => {
        if (params.componentType !== 'legend') return;
        updateMarkerFocus(selectedNavFundCode, selectedNavFundCode);
    });

    chart.on('highlight', params => {
        const seriesName = params.batch?.[0]?.seriesName || params.seriesName;
        const metric = metrics.find(item => formatNavFundName(item) === seriesName);
        if (!metric) return;
        updateMarkerFocus(metric.code, metric.code);
    });

    chart.on('downplay', () => {
        updateMarkerFocus(selectedNavFundCode, selectedNavFundCode);
    });

    chart.on('datazoom', () => {
        const zoom = chart.getOption().dataZoom?.[0];
        if (!zoom) return;

        chartContext.zoomRange = {
            start: Number.isFinite(zoom.start) ? zoom.start : 0,
            end: Number.isFinite(zoom.end) ? zoom.end : 100
        };
        const zoomedParts = buildNavChartParts(chartContext);
        chart.setOption({ series: zoomedParts.series }, false);
    });

    window.addEventListener('resize', () => chart.resize(), { passive: true });
}

function buildNavBenchmarkSeries(benchmarkName, benchmarkData) {
    return benchmarkData.length > 0 ? {
        name: benchmarkName,
        type: 'line',
        showSymbol: false,
        smooth: false,
        data: benchmarkData,
        lineStyle: {
            width: navChartBenchmarkLineWidth,
            type: 'dashed',
            color: '#94a3b8',
            opacity: 0.95
        },
        itemStyle: { color: '#94a3b8' },
        emphasis: { disabled: true },
        z: 0
    } : null;
}

function buildNavAxisMirrorSeries(chartSeries, benchmarkData) {
    return {
        name: '__axis_mirror__',
        type: 'line',
        yAxisIndex: 1,
        data: [...chartSeries.flatMap(series => series.data || []), ...(benchmarkData || [])],
        showSymbol: false,
        silent: true,
        tooltip: { show: false },
        lineStyle: { opacity: 0 },
        itemStyle: { opacity: 0 },
        emphasis: { disabled: true }
    };
}

function buildNavChartParts(context, markerFundCode = selectedNavFundCode, focusFundCode = selectedNavFundCode) {
    const zoomBounds = getNavZoomBounds(context.metrics, context.periodKey, context.zoomRange);
    const chartSeries = buildNavChartSeries(context.metrics, context.periodKey, markerFundCode, focusFundCode, zoomBounds);
    const drawdownSeries = buildSingleFundMaxDrawdownSeries(context.metrics, context.periodKey, zoomBounds);
    const benchmarkData = buildAnnualBenchmarkSeries(chartSeries, zoomBounds?.startTime ?? null);
    const benchmarkSeries = buildNavBenchmarkSeries(context.benchmarkName, benchmarkData);
    const axisMirrorSeries = buildNavAxisMirrorSeries(chartSeries, benchmarkData);
    return {
        chartSeries,
        series: [...chartSeries, ...drawdownSeries, ...(benchmarkSeries ? [benchmarkSeries] : []), axisMirrorSeries]
    };
}

function bindNavChartPeriodSwitch(metrics) {
    document.querySelectorAll('.nav-chart-range-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            document.querySelectorAll('.nav-chart-range-chip').forEach(item => item.classList.remove('active'));
            chip.classList.add('active');
            const periodKey = chip.dataset.navChartPeriod || defaultNavChartPeriod;
            updateNavSummary(metrics, periodKey);
            renderNavChart(metrics, periodKey);
        });
    });
}

function renderOneYearNavData(data, statusText) {
    const status = document.getElementById('oneYearNavStatus');
    const metricWrap = document.getElementById('oneYearNavMetrics');
    if (!status || !metricWrap) return false;

    const metrics = buildNavMetrics(data.funds || []);
    if (metrics.length === 0) return false;

    status.textContent = statusText;
    updateNavSummary(metrics, defaultNavChartPeriod);
    metricWrap.innerHTML = renderNavMetricCards(metrics);
    renderNavChart(metrics, defaultNavChartPeriod);
    bindNavChartPeriodSwitch(metrics);
    bindNavMetricSelection(metrics);
    updateNavMetricSelection();

    if (Array.isArray(data.failedCodes) && data.failedCodes.length > 0) {
        status.textContent += ` ${i18n[state.currentLang].navPartialFailed}: ${data.failedCodes.join(', ')}`;
    }

    return true;
}

async function loadOneYearNav(codes, requestId) {
    const dict = i18n[state.currentLang];
    const section = document.getElementById('oneYearNavSection');
    const status = document.getElementById('oneYearNavStatus');
    const metricWrap = document.getElementById('oneYearNavMetrics');
    if (!section || !status || !metricWrap) return;

    try {
        const data = await fetchThreeYearFundNav(codes);
        if (!isActiveModalRequest('trend', requestId)) return;

        const rendered = renderOneYearNavData(data, dict.navDataNotice);
        if (!rendered) throw new Error('No nav metrics');

    } catch (error) {
        if (!isActiveModalRequest('trend', requestId)) return;

        status.textContent = dict.navFetchError;
        metricWrap.innerHTML = '';
    }
}

function updateMobileCompareCards(rows, comparisonColumns, dict) {
    const cards = document.querySelector('.compare-mobile-card-list');
    if (!cards) return;

    const primaryColumn = comparisonColumns.find(([, key]) => key === mobileCompareSortKey) || comparisonColumns.find(([, key]) => key === defaultMobileSortKey) || comparisonColumns[0];
    const primaryKey = primaryColumn[1];
    const defaultKeys = new Set(['w1', 'm1', 'm3', 'm6', 'y1']);
    const defaultColumns = comparisonColumns.filter(([, key]) => defaultKeys.has(key) && key !== primaryKey);
    const moreColumns = comparisonColumns.filter(([, key]) => !defaultKeys.has(key));

    cards.innerHTML = renderMobileCompareCards(rows, primaryColumn, defaultColumns, moreColumns, dict);
}

function updateMobileSortChips() {
    document.querySelectorAll('.compare-mobile-sort-chip').forEach(chip => {
        const active = chip.dataset.compareSort === mobileCompareSortKey;
        chip.classList.toggle('active', active);
        chip.textContent = `${chip.dataset.label}${active ? (mobileCompareSortOrder === 1 ? ' ▲' : ' ▼') : ''}`;
    });
}

function bindMobileCompareSorting(rows, comparisonColumns, dict) {
    document.querySelectorAll('.compare-mobile-sort-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            const key = chip.dataset.compareSort;
            if (mobileCompareSortKey === key) {
                mobileCompareSortOrder *= -1;
            } else {
                mobileCompareSortKey = key;
                mobileCompareSortOrder = -1;
            }
            applyCompareSort(rows, mobileCompareSortKey, mobileCompareSortOrder);
            updateMobileCompareCards(rows, comparisonColumns, dict);
            updateMobileSortChips();
        });
    });
}

export function closeModal(event) {
    if (event && event.target !== document.getElementById('analysisModal') && event.currentTarget !== event.target) return;
    const modal = document.getElementById('analysisModal');
    const content = document.getElementById('analysisContent');
    const title = document.getElementById('modalTitle');
    modalRequestSeq += 1;
    modal.dataset.analysisRequestId = String(modalRequestSeq);
    
    modal.classList.remove('show');
    document.body.style.overflow = '';
    
    setTimeout(() => {
        content.innerHTML = '';
        if (title) title.textContent = i18n[state.currentLang].modalTitle;
    }, 300);
}

function openAnalysisModal(codes, groupName, mode, modalTitle) {
    const modal = document.getElementById('analysisModal');
    const content = document.getElementById('analysisContent');
    const loader = document.getElementById('modalLoader');
    const title = document.getElementById('modalTitle');
    const codeList = Array.isArray(codes) ? codes : [codes];
    const requestId = String(++modalRequestSeq);

    modal.dataset.analysisCodes = codeList.join(',');
    modal.dataset.analysisGroupName = groupName;
    modal.dataset.analysisMode = mode;
    modal.dataset.analysisRequestId = requestId;

    content.style.display = 'none';
    content.style.opacity = '0';
    content.innerHTML = '';
    if (title) title.textContent = modalTitle;
    loader.classList.remove('hidden');
    modal.classList.add('show');
    document.body.style.overflow = 'hidden';

    return { content, loader, title, codeList, requestId };
}

function isActiveModalRequest(mode, requestId) {
    const modal = document.getElementById('analysisModal');
    return Boolean(
        modal &&
        modal.classList.contains('show') &&
        modal.dataset.analysisMode === mode &&
        modal.dataset.analysisRequestId === requestId
    );
}

function showModalContent(content, loader) {
    loader.classList.add('hidden');
    content.style.display = 'block';
    void content.offsetWidth;
    content.style.opacity = '1';
}

export function navigateToNavTrend(codes, groupName = '') {
    const dict = i18n[state.currentLang];
    const titleText = `${groupName ? `${groupName} · ` : ''}${dict.navTrendTitle}`;
    const { content, loader, codeList, requestId } = openAnalysisModal(codes, groupName, 'trend', titleText);
    selectedNavFundCode = '';

    content.innerHTML = `
        <section id="oneYearNavSection" class="one-year-nav-section standalone-trend-section">
            <div class="one-year-nav-head">
                <div>
                    <h4>${dict.navOneYearTitle}</h4>
                    <p>${dict.navOneYearDesc}</p>
                </div>
                <span id="oneYearNavStatus" class="one-year-nav-status">${dict.loading}</span>
            </div>
            <div class="nav-chart-range-bar" aria-label="${dict.navChartRange}">
                ${[
                    ['period1m', 'm1'],
                    ['period3m', 'm3'],
                    ['period6m', 'm6'],
                    ['periodYtd', 'ytd'],
                    ['period1y', 'y1'],
                    ['period3y', 'y3']
                ].map(([label, key]) => `<button class="nav-chart-range-chip${key === defaultNavChartPeriod ? ' active' : ''}" type="button" data-nav-chart-period="${key}">${dict[label]}</button>`).join('')}
            </div>
            <div id="oneYearNavSummary" class="nav-summary-grid" aria-live="polite">
                <div class="nav-summary-skeleton">${dict.loading}</div>
            </div>
            <div id="oneYearNavChart" class="one-year-nav-chart"></div>
            <div id="oneYearNavMetrics" class="nav-metric-list"></div>
        </section>
    `;

    showModalContent(content, loader);
    loadOneYearNav(codeList, requestId);
}

export function navigateToAnalysis(codes, groupName = '') {
    const dict = i18n[state.currentLang];
    const { content, loader, title, codeList, requestId } = openAnalysisModal(codes, groupName, 'returns', i18n[state.currentLang].modalTitle);

    // Fetch native data
    const script = document.createElement('script');
    script.src = `/api/fundgz?code=${codeList.join(',')}&t=1&rt=${Date.now()}`;
    
    // Generate native UI on load
    script.onload = () => {
        if (!isActiveModalRequest('returns', requestId)) {
            window.fundinfo_yjpj = undefined;
            script.remove();
            return;
        }

        if (typeof window.fundinfo_yjpj !== 'undefined') {
            const data = window.fundinfo_yjpj;
            const rows = (data.jdsy || []).map(row => {
                const [
                    fundCode = '-', name = '-', estDate = '-',
                    ytd = '-', w1 = '-', m1 = '-', m3 = '-', m6 = '-', y1 = '-',
                    y2 = '-', y3 = '-', y5 = '-', inc = '-'
                ] = String(row).split(',');
                return { fundCode, name, estDate, ytd, w1, m1, m3, m6, y1, y2, y3, y5, inc };
            });

            if (rows.length === 0) {
                loader.classList.add('hidden');
                content.style.display = 'block';
                content.style.opacity = '1';
                content.innerHTML = `<div class="error-message modal-error">${i18n[state.currentLang].fetchError} (No Data)</div>`;
                window.fundinfo_yjpj = undefined;
                script.remove();
                return;
            }

            const comparisonColumns = [
                ['period1w', 'w1'],
                ['period1m', 'm1'],
                ['period3m', 'm3'],
                ['period6m', 'm6'],
                ['periodYtd', 'ytd'],
                ['period1y', 'y1'],
                ['period2y', 'y2'],
                ['period3y', 'y3'],
                ['period5y', 'y5'],
                ['periodInc', 'inc']
            ];
            const primaryColumn = ['period1y', 'y1'];
            compareSortKey = '';
            compareSortOrder = 1;
            mobileCompareSortKey = defaultMobileSortKey;
            mobileCompareSortOrder = -1;
            const mobileSortColumns = [
                ['period1w', 'w1'],
                ['period1m', 'm1'],
                ['period3m', 'm3'],
                ['period1y', 'y1']
            ];
            const mobileRows = [...rows];
            applyCompareSort(mobileRows, mobileCompareSortKey, mobileCompareSortOrder);
            if (title) {
                title.textContent = `${groupName ? `${groupName} · ` : ''}${dict.modalTitle} · ${rows.length} ${dict.compareCount}`;
            }

            content.innerHTML = `
                <section class="period-return-section">
                    <div class="period-return-head">
                        <div>
                            <h4>${dict.periodReturnTitle}</h4>
                            <p>${dict.periodReturnDesc}</p>
                        </div>
                    </div>

                    <div class="analysis-compare-summary">
                        ${rows.map(row => `
                            <div class="compare-summary-card">
                                <div class="compare-summary-name">
                                    <strong>${row.name}</strong>
                                    <span>${row.fundCode}</span>
                                </div>
                                <div class="compare-summary-return">
                                    <span>${dict[primaryColumn[0]]}</span>
                                    ${formatRet(row[primaryColumn[1]])}
                                </div>
                            </div>
                        `).join('')}
                    </div>

                    <div class="analysis-compare-wrap">
                        <table class="analysis-compare-table">
                            <thead>
                                <tr>
                                    <th data-compare-sort="name">${dict.compareName}<span class="sort-icon"></span></th>
                                    ${comparisonColumns.map(([label, key]) => `<th data-compare-sort="${key}">${dict[label]}<span class="sort-icon"></span></th>`).join('')}
                                </tr>
                            </thead>
                            <tbody>
                                ${renderCompareRows(rows, comparisonColumns)}
                            </tbody>
                        </table>
                    </div>

                    <div class="analysis-compare-cards">
                        <div class="compare-mobile-sort-bar">
                            <span>${i18n[state.currentLang].sortLabel}</span>
                            <div class="compare-mobile-sort-chips">
                                ${mobileSortColumns.map(([label, key]) => `<button class="compare-mobile-sort-chip${key === mobileCompareSortKey ? ' active' : ''}" type="button" data-compare-sort="${key}" data-label="${dict[label]}">${dict[label]}${key === mobileCompareSortKey ? ' ▼' : ''}</button>`).join('')}
                            </div>
                        </div>
                        <div class="compare-mobile-card-list">
                            ${renderMobileCompareCards(mobileRows, primaryColumn, comparisonColumns.filter(([, key]) => ['w1', 'm1', 'm3', 'm6', 'y1'].includes(key) && key !== primaryColumn[1]), comparisonColumns.filter(([, key]) => !['w1', 'm1', 'm3', 'm6', 'y1'].includes(key)), dict)}
                        </div>
                    </div>
                </section>
            `;
            
            showModalContent(content, loader);
            bindCompareSorting(rows, comparisonColumns);
            bindMobileCompareSorting(mobileRows, comparisonColumns, dict);
        } else {
            loader.classList.add('hidden');
            content.style.display = 'block';
            content.style.opacity = '1';
            content.innerHTML = `<div class="error-message modal-error">${i18n[state.currentLang].fetchError} (No Data)</div>`;
        }
        window.fundinfo_yjpj = undefined;
        script.remove();
    };
    
    script.onerror = () => {
        if (!isActiveModalRequest('returns', requestId)) {
            script.remove();
            return;
        }

        loader.classList.add('hidden');
        content.style.display = 'block';
        content.style.opacity = '1';
        content.innerHTML = `<div class="error-message modal-error">${i18n[state.currentLang].fetchError} (Network Error)</div>`;
        script.remove();
    };
    document.head.appendChild(script);
}

export function initModalListeners() {
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const modal = document.getElementById('analysisModal');
            if (modal.classList.contains('show')) {
                closeModal();
            }
        }
    });
}
