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
        // The date is kept unbroken so a narrow tile wraps before it, not at its hyphens.
        card(t('dataStatus'), `${valid.length}/${state.accounts.length}`, latestDate ? `${syncedCount}/${valid.length} ${escapeHtml(t('updatedTo'))} <span class="nowrap">${escapeHtml(latestDate)}</span>${laggedCount > 0 ? `, ${laggedCount} ${escapeHtml(t('lagged'))}` : ''}` : escapeHtml(t('computableAllAccounts')), '', true)
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
        const card = event.target.closest('.cmp-row[data-highlight-account]');
        if (!card || event.target !== card) return;
        event.preventDefault();
        onHighlight(card.dataset.highlightAccount);
    });
}

// Phones get a divided list like the allocation class rows instead of a wide table that only fits one
// account column at a time. A tap highlights the account's line and opens its risk metrics in place.
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
            <ul class="cmp-list">
                ${sortedMetrics.map(metric => renderComparisonListRow(metric, slotById.get(metric.account.id) ?? 0)).join('')}
            </ul>
        </div>
    `;
}

function renderComparisonListRow(metric, slot) {
    const active = state.selectedHighlightAccountId === metric.account.id;
    // The dot doubles as the chart legend on phones, so it uses the same color slot as the line.
    const color = metric.valid ? `var(--chart-series-${(slot % 6) + 1})` : 'var(--border-strong)';
    const attrs = `class="cmp-row${active ? ' active' : ''}${metric.valid ? '' : ' invalid'}" data-highlight-account="${metric.account.id}" role="button" tabindex="0" aria-pressed="${active}"`;
    const name = `
        <span class="cmp-row-dot" style="background:${color}" aria-hidden="true"></span>
        <span class="cmp-row-name">
            <strong>${escapeHtml(metric.account.name)}</strong>
            <small>${metric.valid ? `${t('comparisonRowAssets')} ${formatCurrency(metric.latestValue, state.amountsHidden)}` : escapeHtml(metric.error || t('insufficientData'))}</small>
        </span>
    `;
    if (!metric.valid) return `<li ${attrs}><div class="cmp-row-main">${name}</div></li>`;

    const stat = (label, value) => `<div><dt>${label}</dt><dd>${value}</dd></div>`;
    return `
        <li ${attrs} aria-expanded="${active}">
            <div class="cmp-row-main">
                ${name}
                <span class="cmp-row-figures">
                    <strong>${formatMetricPercent(metric, 'periodReturn')}</strong>
                    <small>${t('comparisonRowPnl')} ${formatMetricCurrency(metric, 'profitLoss')}</small>
                </span>
                <svg class="cmp-row-chevron" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </div>
            ${active ? `
                <dl class="cmp-row-details">
                    ${stat(t('annualizedReturn'), formatMetricPercent(metric, 'annualizedReturn'))}
                    ${stat(t('maxDrawdown'), formatMetricPercent(metric, 'maxDrawdown'))}
                    ${stat(t('annualizedVolatility'), formatMetricPercent(metric, 'annualizedVolatility', false))}
                    ${stat(t('calmarRatio'), formatMetricRatio(metric, 'calmarRatio'))}
                </dl>
                <p class="cmp-row-date">${t('latestSnapshot')} ${escapeHtml(metric.latestDate || '-')}</p>
            ` : ''}
        </li>
    `;
}

function card(label, value, note, className = '', noteIsHtml = false) {
    return `<div class="overview-card management-overview-card"><span>${label}</span><strong class="${className}">${value}</strong><small>${noteIsHtml ? note : escapeHtml(note)}</small></div>`;
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
