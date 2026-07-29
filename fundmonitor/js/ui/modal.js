import { state } from '../config/state.js';
import { i18n } from '../config/i18n.js';
import { formatRet } from '../utils/formatter.js';
import { fetchOneYearFundNav } from '../api/fundNavApi.js';
import { buildNavMetrics } from '../utils/navMetrics.js';

let compareSortKey = '';
let compareSortOrder = 1;
let mobileCompareSortKey = '';
let mobileCompareSortOrder = 1;
const defaultMobileSortKey = 'y1';
let modalRequestSeq = 0;
const defaultNavChartPeriod = 'y1';

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
                <summary>${state.currentLang === 'zh' ? '展开更多' : 'More periods'}</summary>
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

function renderNavMetricCards(metrics) {
    const dict = i18n[state.currentLang];
    const periodItems = [
        ['period1w', 'w1'],
        ['period1m', 'm1'],
        ['period3m', 'm3'],
        ['period6m', 'm6'],
        ['period1y', 'y1']
    ];

    return metrics.map(metric => `
        <div class="nav-metric-card">
            <div class="nav-metric-name">
                <strong>${metric.name}</strong>
                <span>${metric.code}</span>
            </div>
            <div class="nav-period-metric-table">
                <div class="nav-period-metric-row nav-period-metric-header">
                    <span>${dict.navPeriodRange}</span>
                    <span>${dict.navPeriodReturn}</span>
                    <span>${dict.navMaxDrawdown}</span>
                </div>
                ${periodItems.map(([label, key]) => `
                    <div class="nav-period-metric-row">
                        <strong>${dict[label]}</strong>
                        <div>${formatPercentValue(metric.periods?.[key]?.returnValue)}</div>
                        <div>${formatPercentValue(metric.periods?.[key]?.maxDrawdown)}</div>
                    </div>
                `).join('')}
            </div>
            <div class="nav-metric-footer">
                <span>${dict.navLatestDate}</span>
                <strong>${metric.latestDate || '-'}</strong>
            </div>
        </div>
    `).join('');
}

function renderNavSummary(metrics, periodKey = defaultNavChartPeriod) {
    const dict = i18n[state.currentLang];
    const periodLabels = {
        m1: dict.period1m,
        m3: dict.period3m,
        m6: dict.period6m,
        y1: dict.period1y
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
            <small>${card.metric ? `${card.metric.name} ${card.metric.code}` : dict.navAllFunds}</small>
        </div>
    `).join('');
}

function updateNavSummary(metrics, periodKey = defaultNavChartPeriod) {
    const summaryEl = document.getElementById('oneYearNavSummary');
    if (!summaryEl) return;
    summaryEl.innerHTML = renderNavSummary(metrics, periodKey);
}

function renderNavChart(metrics, periodKey = defaultNavChartPeriod) {
    const chartEl = document.getElementById('oneYearNavChart');
    if (!chartEl || typeof window.echarts === 'undefined') return;

    const existingChart = window.echarts.getInstanceByDom(chartEl);
    if (existingChart) existingChart.dispose();

    const chart = window.echarts.init(chartEl);
    chart.setOption({
        color: ['#2563eb', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#84cc16', '#f97316', '#ec4899', '#64748b'],
        tooltip: {
            trigger: 'axis',
            valueFormatter: value => `${Number(value).toFixed(2)}%`
        },
        legend: {
            type: 'scroll',
            top: 0,
            textStyle: { color: getComputedStyle(document.documentElement).getPropertyValue('--text-color').trim() || '#111827' }
        },
        grid: { top: 42, right: 18, bottom: 34, left: 48 },
        xAxis: { type: 'time', boundaryGap: false },
        yAxis: {
            type: 'value',
            axisLabel: { formatter: '{value}%' },
            splitLine: { lineStyle: { color: getComputedStyle(document.documentElement).getPropertyValue('--border-color').trim() || '#e5e7eb' } }
        },
        dataZoom: [{ type: 'inside' }],
        series: metrics.map(metric => ({
            name: `${metric.name} ${metric.code}`,
            type: 'line',
            showSymbol: false,
            smooth: true,
            emphasis: { focus: 'series' },
            data: metric.chartSeries?.[periodKey] || metric.series
        }))
    });

    window.addEventListener('resize', () => chart.resize(), { passive: true });
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
        const data = await fetchOneYearFundNav(codes);
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
                    ['period1y', 'y1']
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
            delete window.fundinfo_yjpj;
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
                delete window.fundinfo_yjpj;
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
                            <span>${state.currentLang === 'zh' ? '排序' : 'Sort'}</span>
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
        delete window.fundinfo_yjpj;
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
