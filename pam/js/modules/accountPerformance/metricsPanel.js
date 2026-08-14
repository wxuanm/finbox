import { PERIODS, state } from '../../config/state.js';
import { periodLabel, t } from '../../config/i18n.js';
import { escapeHtml, formatCurrency, formatPercent, signedClass } from '../../utils/formatter.js';

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
    const columns = [
        ['name', t('account')],
        ['periodReturn', t('periodReturn')],
        ['annualizedReturn', t('annualizedReturn')],
        ['maxDrawdown', t('maxDrawdown'), 'desktop-only'],
        ['annualizedVolatility', t('annualizedVolatility'), 'desktop-only'],
        ['calmarRatio', t('calmarRatio')],
        ['latestValue', t('latestAssets')],
        ['profitLoss', t('cumulativePnl'), 'desktop-only'],
        ['latestDate', t('latestSnapshot'), 'desktop-only']
    ];

    wrap.innerHTML = `
        <table class="comparison-table">
            <thead>
                <tr>
                    ${columns.map(([key, label, visibility]) => `
                        <th class="${[key === 'name' ? '' : 'number-cell', visibility || ''].filter(Boolean).join(' ')}" data-comparison-sort="${key}">
                            <button type="button">${label}${sortIcon(key)}</button>
                        </th>
                    `).join('')}
                </tr>
            </thead>
            <tbody>
                ${sortedMetrics.map(metric => renderComparisonRow(metric)).join('')}
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

function renderComparisonRow(metric) {
    const active = state.selectedHighlightAccountId === metric.account.id;
    if (!metric.valid) {
        return `
            <tr class="comparison-row invalid${active ? ' active' : ''}" data-highlight-account="${metric.account.id}">
                <td><strong>${escapeHtml(metric.account.name)}</strong><small>${escapeHtml(metric.error || t('insufficientData'))}</small></td>
                <td colspan="8">${t('needTwoSnapshots')}</td>
            </tr>
        `;
    }

    return `
        <tr class="comparison-row${active ? ' active' : ''}" data-highlight-account="${metric.account.id}">
            <td><strong>${escapeHtml(metric.account.name)}</strong><small>${t('clickHighlight')}</small></td>
            <td class="number-cell ${signedClass(metric.periodReturn)}" data-mobile-label="${t('periodReturn')}">${formatPercent(metric.periodReturn)}</td>
            <td class="number-cell ${signedClass(metric.annualizedReturn)}" data-mobile-label="${t('annualizedReturn')}">${formatPercent(metric.annualizedReturn)}</td>
            <td class="number-cell desktop-only ${signedClass(metric.maxDrawdown)}">${formatPercent(metric.maxDrawdown)}</td>
            <td class="number-cell desktop-only">${formatPercent(metric.annualizedVolatility)}</td>
            <td class="number-cell ${signedClass(metric.calmarRatio)}" data-mobile-label="${t('calmarRatio')}">${formatNumber(metric.calmarRatio)}</td>
            <td class="number-cell" data-mobile-label="${t('latestAssets')}">${formatCurrency(metric.latestValue, state.amountsHidden)}</td>
            <td class="number-cell desktop-only ${signedClass(metric.profitLoss)}">${formatCurrency(metric.profitLoss, state.amountsHidden)}</td>
            <td class="number-cell desktop-only">${metric.latestDate || '-'}</td>
        </tr>
    `;
}

function formatNumber(value) {
    return Number.isFinite(value) ? value.toFixed(2) : '-';
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
