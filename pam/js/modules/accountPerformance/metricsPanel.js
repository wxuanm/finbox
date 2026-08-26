import { PERIODS, state } from '../../config/state.js';
import { periodLabel, t } from '../../config/i18n.js';
import { escapeHtml, formatCurrency, formatPercent, formatRatio, signedClass } from '../../utils/formatter.js';

export function renderOverviewCards(metrics) {
    const wrap = document.getElementById('overviewCards');
    if (!wrap) return;
    const valid = metrics.filter(metric => metric.valid);
    const latestValue = valid.reduce((sum, metric) => sum + metric.latestValue, 0);
    const profitLoss = valid.reduce((sum, metric) => sum + metric.profitLoss, 0);
    const best = valid.reduce((current, metric) => !current || metric.periodReturn > current.periodReturn ? metric : current, null);
    const latestDate = valid.reduce((latest, metric) => metric.latestDate > latest ? metric.latestDate : latest, '');
    const syncedCount = latestDate ? valid.filter(metric => metric.latestDate === latestDate).length : 0;
    const laggedCount = Math.max(valid.length - syncedCount, 0);

    wrap.innerHTML = [
        card(t('latestTotalAssets'), formatCurrency(latestValue, state.amountsHidden), t('validAccountsTotal')),
        card(t('cumulativePnl'), formatCurrency(profitLoss, state.amountsHidden), t('estimatedByNetInput'), signedClass(profitLoss)),
        card(t('bestInPeriod'), best ? formatPercent(best.periodReturn) : '-', best ? best.account.name : t('waitingValidSnapshot'), signedClass(best?.periodReturn)),
        card(t('dataStatus'), `${valid.length}/${state.accounts.length}`, latestDate ? `${syncedCount}/${valid.length} ${t('updatedTo')} ${latestDate}${laggedCount > 0 ? `, ${laggedCount} ${t('lagged')}` : ''}` : t('computableAllAccounts'))
    ].join('');
}

export function renderAccountComparison(metrics) {
    const wrap = document.getElementById('accountComparison');
    const periodLabel = document.getElementById('comparisonPeriodLabel');
    if (!wrap) return;
    if (periodLabel) periodLabel.textContent = currentPeriodLabel();

    if (state.accounts.length === 0) {
        wrap.innerHTML = `<div class="empty-state">${t('noAccountsAddSnapshot')}</div>`;
        return;
    }

    const sortedMetrics = [...metrics].sort(compareMetrics);
    const rows = [
        ['periodReturn', t('periodReturn'), metric => formatMetricPercent(metric, 'periodReturn')],
        ['annualizedReturn', t('annualizedReturn'), metric => formatMetricPercent(metric, 'annualizedReturn')],
        ['maxDrawdown', t('maxDrawdown'), metric => formatMetricPercent(metric, 'maxDrawdown')],
        ['annualizedVolatility', t('annualizedVolatility'), metric => formatMetricPercent(metric, 'annualizedVolatility', false)],
        ['calmarRatio', t('calmarRatio'), metric => formatMetricRatio(metric, 'calmarRatio')],
        ['latestValue', t('latestAssets'), metric => formatMetricCurrency(metric, 'latestValue')],
        ['profitLoss', t('cumulativePnl'), metric => formatMetricCurrency(metric, 'profitLoss')],
        ['latestDate', t('latestSnapshot'), metric => metric.valid ? (metric.latestDate || '-') : '-']
    ];

    wrap.innerHTML = `
        <table class="comparison-table">
            <thead>
                <tr>
                    <th data-comparison-sort="name"><button type="button">${t('account')}${sortIcon('name')}</button></th>
                    ${sortedMetrics.map(metric => renderComparisonAccountHeader(metric)).join('')}
                </tr>
            </thead>
            <tbody>
                ${rows.map(([key, label, renderValue]) => renderComparisonMetricRow(key, label, sortedMetrics, renderValue)).join('')}
            </tbody>
        </table>
    `;
}

export function bindAccountComparison({ onHighlight, onSort }) {
    const wrap = document.getElementById('accountComparison');
    if (!wrap) return;
    wrap.addEventListener('click', event => {
        const sortHeader = event.target.closest('[data-comparison-sort]');
        if (sortHeader) {
            onSort(sortHeader.dataset.comparisonSort);
            return;
        }

        const row = event.target.closest('[data-highlight-account]');
        if (row) onHighlight(row.dataset.highlightAccount);
    });
}

function card(label, value, note, className = '') {
    return `<div class="overview-card management-overview-card"><span>${label}</span><strong class="${className}">${value}</strong><small>${escapeHtml(note)}</small></div>`;
}

function renderComparisonAccountHeader(metric) {
    const active = state.selectedHighlightAccountId === metric.account.id;
    return `
        <th class="comparison-account-heading${active ? ' active' : ''}" data-highlight-account="${metric.account.id}">
            <strong>${escapeHtml(metric.account.name)}</strong>
            ${metric.valid ? '' : `<small>${escapeHtml(metric.error || t('insufficientData'))}</small>`}
        </th>
    `;
}

function renderComparisonMetricRow(key, label, metrics, renderValue) {
    return `
        <tr class="comparison-metric-row">
            <th data-comparison-sort="${key}"><button type="button">${label}${sortIcon(key)}</button></th>
            ${metrics.map(metric => renderComparisonMetricCell(metric, renderValue)).join('')}
        </tr>
    `;
}

function renderComparisonMetricCell(metric, renderValue) {
    const active = state.selectedHighlightAccountId === metric.account.id;
    if (!metric.valid) {
        return `<td class="comparison-account-cell invalid${active ? ' active' : ''}" data-highlight-account="${metric.account.id}">-</td>`;
    }

    return `<td class="comparison-account-cell${active ? ' active' : ''}" data-highlight-account="${metric.account.id}">${renderValue(metric)}</td>`;
}

function formatMetricPercent(metric, key, signed = true) {
    return `<span class="${signed ? signedClass(metric[key]) : ''}">${formatPercent(metric[key])}</span>`;
}

function formatMetricRatio(metric, key) {
    return `<span class="${signedClass(metric[key])}">${formatRatio(metric[key])}</span>`;
}

function formatMetricCurrency(metric, key) {
    return `<span class="${signedClass(key === 'profitLoss' ? metric[key] : null)}">${formatCurrency(metric[key], state.amountsHidden)}</span>`;
}

function compareMetrics(a, b) {
    const direction = state.comparisonSortOrder || -1;
    const key = state.comparisonSortKey || 'periodReturn';
    if (key === 'name') return a.account.name.localeCompare(b.account.name, 'zh-CN', { numeric: true }) * direction;
    if (key === 'latestDate') return String(a.latestDate || '').localeCompare(String(b.latestDate || '')) * direction;

    const aValue = getSortableValue(a, key);
    const bValue = getSortableValue(b, key);
    if (!Number.isFinite(aValue) && !Number.isFinite(bValue)) return 0;
    if (!Number.isFinite(aValue)) return 1;
    if (!Number.isFinite(bValue)) return -1;
    return (aValue - bValue) * direction;
}

function getSortableValue(metric, key) {
    if (!metric.valid || metric[key] === null || metric[key] === undefined) return Number.NEGATIVE_INFINITY;
    return Number(metric[key]);
}

function sortIcon(key) {
    if (state.comparisonSortKey !== key) return '';
    return state.comparisonSortOrder === 1 ? ' ▲' : ' ▼';
}

function currentPeriodLabel() {
    return periodLabel(PERIODS.find(([key]) => key === state.selectedPeriod)?.[0] || state.selectedPeriod);
}
