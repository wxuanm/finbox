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

    // Chart colors follow each account's position in the full list; mirror that here so cards match their line.
    const slotById = new Map(metrics.map((metric, index) => [metric.account.id, index]));
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
        ${renderComparisonMobile(sortedMetrics, rows, slotById)}
    `;
}

export function bindAccountComparison({ onHighlight, onSort }) {
    const wrap = document.getElementById('accountComparison');
    if (!wrap) return;
    wrap.addEventListener('click', event => {
        // The mobile sort <select> lives inside the wrap; its own change event drives sorting.
        if (event.target.closest('select')) return;
        const sortHeader = event.target.closest('[data-comparison-sort]');
        if (sortHeader) {
            onSort(sortHeader.dataset.comparisonSort);
            return;
        }

        const row = event.target.closest('[data-highlight-account]');
        if (row) onHighlight(row.dataset.highlightAccount);
    });
    wrap.addEventListener('change', event => {
        const select = event.target.closest('[data-comparison-sort-select]');
        if (select) onSort(select.value);
    });
    wrap.addEventListener('keydown', event => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        const card = event.target.closest('.comparison-card[data-highlight-account]');
        if (!card || event.target !== card) return;
        event.preventDefault();
        onHighlight(card.dataset.highlightAccount);
    });
}

// Phones get one card per account instead of a wide table that only fits one account column at a time.
function renderComparisonMobile(sortedMetrics, rows, slotById) {
    const sortKey = state.comparisonSortKey || 'periodReturn';
    const ascending = state.comparisonSortOrder === 1;
    const options = [['name', t('account')], ...rows.map(([key, label]) => [key, label])]
        .map(([key, label]) => `<option value="${key}"${key === sortKey ? ' selected' : ''}>${escapeHtml(label)}</option>`)
        .join('');
    const directionLabel = ascending ? t('sortAscending') : t('sortDescending');
    return `
        <div class="comparison-mobile">
            <div class="comparison-sort-bar">
                <label class="comparison-sort-select">
                    <span>${t('sortBy')}</span>
                    <select data-comparison-sort-select aria-label="${escapeHtml(t('sortBy'))}">${options}</select>
                </label>
                <button class="comparison-sort-direction" type="button" data-comparison-sort="${sortKey}" aria-label="${escapeHtml(directionLabel)}" title="${escapeHtml(directionLabel)}">
                    <span aria-hidden="true">${ascending ? '↑' : '↓'}</span>${directionLabel}
                </button>
            </div>
            <div class="comparison-cards">
                ${sortedMetrics.map(metric => renderComparisonCard(metric, slotById.get(metric.account.id) ?? 0)).join('')}
            </div>
        </div>
    `;
}

function renderComparisonCard(metric, slot) {
    const active = state.selectedHighlightAccountId === metric.account.id;
    const color = metric.valid ? `var(--chart-series-${(slot % 6) + 1})` : 'var(--border-strong)';
    const head = `
        <div class="comparison-card-head">
            <i class="comparison-card-dot" style="background:${color}" aria-hidden="true"></i>
            <strong>${escapeHtml(metric.account.name)}</strong>
            <small>${metric.valid ? escapeHtml(metric.latestDate || '-') : escapeHtml(metric.error || t('insufficientData'))}</small>
        </div>
    `;
    const attrs = `class="comparison-card${active ? ' active' : ''}${metric.valid ? '' : ' invalid'}" data-highlight-account="${metric.account.id}" role="button" tabindex="0" aria-pressed="${active}"`;
    if (!metric.valid) return `<article ${attrs}>${head}</article>`;

    const stat = (label, value) => `<div><span>${label}</span><strong>${value}</strong></div>`;
    return `
        <article ${attrs}>
            ${head}
            <div class="comparison-card-hero">
                <div class="comparison-card-return">
                    <span>${t('periodReturn')}</span>
                    <strong>${formatMetricPercent(metric, 'periodReturn')}</strong>
                </div>
                <div class="comparison-card-money">
                    ${stat(t('latestAssets'), formatMetricCurrency(metric, 'latestValue'))}
                    ${stat(t('cumulativePnl'), formatMetricCurrency(metric, 'profitLoss'))}
                </div>
            </div>
            <div class="comparison-card-metrics">
                ${stat(t('annualizedReturn'), formatMetricPercent(metric, 'annualizedReturn'))}
                ${stat(t('maxDrawdown'), formatMetricPercent(metric, 'maxDrawdown'))}
                ${stat(t('annualizedVolatility'), formatMetricPercent(metric, 'annualizedVolatility', false))}
                ${stat(t('calmarRatio'), formatMetricRatio(metric, 'calmarRatio'))}
            </div>
        </article>
    `;
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
