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

// Phones replace the four overview cards with one summary card in the style of the 账户管理 account summary:
// total assets, period P/L, and period return in a divided row.
export function renderReturnsHero(portfolio) {
    const wrap = document.getElementById('returnsHero');
    if (!wrap) return;
    const masked = state.amountsHidden;
    const stat = (label, value, className = '') => `<div><dt>${escapeHtml(label)}</dt><dd class="${className}">${value}</dd></div>`;
    wrap.innerHTML = `
        <dl class="returns-summary-stats">
            ${stat(t('totalAssets'), portfolio ? formatCurrency(portfolio.latestValue, masked) : '-')}
            ${stat(t('periodPnl'), portfolio ? formatSignedCurrency(portfolio.periodProfitLoss, masked) : '-', signedClass(portfolio?.periodProfitLoss))}
            ${stat(t('periodReturn'), portfolio ? formatPercent(portfolio.periodReturn) : '-', signedClass(portfolio?.periodReturn))}
        </dl>
    `;
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
        ${renderComparisonMobile(sortedMetrics, slotById)}
    `;
}

// Expanded rows in the phone ranking; they survive re-renders but not a reload, like holdings rows.
const expandedComparisonRows = new Set();

export function bindAccountComparison({ onHighlight, onSort, onGoToAccount }) {
    const wrap = document.getElementById('accountComparison');
    if (!wrap) return;
    wrap.addEventListener('click', event => {
        // The mobile sort <select> lives inside the wrap; its own change event drives sorting.
        if (event.target.closest('select')) return;
        const goTo = event.target.closest('[data-goto-account]');
        if (goTo) {
            onGoToAccount?.(goTo.dataset.gotoAccount);
            return;
        }
        const toggle = event.target.closest('[data-expand-account]');
        if (toggle) {
            toggleComparisonRow(toggle);
            return;
        }
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
}

// Phones rank accounts in a divided list like the allocation class rows instead of a wide table that only fits
// one account column at a time. Each row carries a diverging bar of its period return, scaled to the largest
// absolute return in the list; a tap opens the account's risk metrics and a link to 账户管理.
const MOBILE_SORT_KEYS = ['periodReturn', 'periodProfitLoss', 'latestValue', 'annualizedReturn', 'maxDrawdown', 'annualizedVolatility', 'calmarRatio', 'profitLoss', 'name'];

function mobileSortLabel(key) {
    return {
        periodReturn: t('periodReturn'),
        periodProfitLoss: t('periodPnl'),
        latestValue: t('latestAssets'),
        annualizedReturn: t('annualizedReturn'),
        maxDrawdown: t('maxDrawdown'),
        annualizedVolatility: t('annualizedVolatility'),
        calmarRatio: t('calmarRatio'),
        profitLoss: t('cumulativePnl'),
        name: t('account')
    }[key];
}

function renderComparisonMobile(sortedMetrics, slotById) {
    const sortKey = MOBILE_SORT_KEYS.includes(state.comparisonSortKey) ? state.comparisonSortKey : 'periodReturn';
    const ascending = state.comparisonSortOrder === 1;
    const options = MOBILE_SORT_KEYS
        .map(key => `<option value="${key}"${key === sortKey ? ' selected' : ''}>${escapeHtml(mobileSortLabel(key))}</option>`)
        .join('');
    const valid = sortedMetrics.filter(metric => metric.valid);
    const barScale = Math.max(0.5, ...valid.map(metric => Math.abs(Number(metric.periodReturn) || 0)));
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
                ${sortedMetrics.map(metric => renderComparisonListRow(metric, slotById.get(metric.account.id) ?? 0, barScale)).join('')}
            </ul>
        </div>
    `;
}

function renderComparisonListRow(metric, slot, barScale) {
    const open = expandedComparisonRows.has(metric.account.id);
    // The dot uses the account's chart color slot, so it matches the account's line in full screen.
    const color = metric.valid ? `var(--chart-series-${(slot % 6) + 1})` : 'var(--border-strong)';
    const name = `
        <span class="cmp-row-dot" style="background:${color}" aria-hidden="true"></span>
        <span class="cmp-row-name">
            <strong>${escapeHtml(metric.account.name)}</strong>
            <small>${metric.valid ? formatCurrency(metric.latestValue, state.amountsHidden) : escapeHtml(metric.error || t('insufficientData'))}</small>
        </span>
    `;
    if (!metric.valid) return `<li class="cmp-row invalid"><div class="cmp-row-main">${name}</div></li>`;

    const periodReturn = Number(metric.periodReturn);
    const tone = signedClass(periodReturn) || 'flat';
    const barWidth = Number.isFinite(periodReturn) ? Math.min(50, Math.abs(periodReturn) / barScale * 50) : 0;
    const barSide = periodReturn < 0 ? 'right' : 'left';
    const stat = (label, value) => `<div><dt>${label}</dt><dd>${value}</dd></div>`;
    const detailsId = `cmpRowDetails-${metric.account.id}`;
    return `
        <li class="cmp-row${open ? ' active' : ''}">
            <button class="cmp-row-main" type="button" data-expand-account="${metric.account.id}" aria-expanded="${open}" aria-controls="${detailsId}">
                ${name}
                <span class="cmp-row-bar" aria-hidden="true"><i class="${tone}" style="${barSide}:50%;width:${barWidth.toFixed(1)}%"></i></span>
                <span class="cmp-row-figures">
                    <strong>${formatMetricPercent(metric, 'periodReturn')}</strong>
                    <small class="${signedClass(metric.periodProfitLoss)}">${formatSignedCurrency(metric.periodProfitLoss, state.amountsHidden)}</small>
                </span>
            </button>
            <div id="${detailsId}" class="cmp-row-expand"${open ? '' : ' hidden'}>
                <dl class="cmp-row-details">
                    ${stat(t('annualizedReturn'), formatMetricPercent(metric, 'annualizedReturn'))}
                    ${stat(t('maxDrawdown'), formatMetricPercent(metric, 'maxDrawdown'))}
                    ${stat(t('annualizedVolatility'), formatMetricPercent(metric, 'annualizedVolatility', false))}
                    ${stat(t('calmarRatio'), formatMetricRatio(metric, 'calmarRatio'))}
                </dl>
                <div class="cmp-row-foot">
                    <span>${t('cumulativePnl')} ${formatMetricCurrency(metric, 'profitLoss')}</span>
                    <button class="cmp-row-goto" type="button" data-goto-account="${metric.account.id}">${escapeHtml(t('goToAccount'))}</button>
                </div>
            </div>
        </li>
    `;
}

// Toggled in place, like the allocation class rows, so the list does not re-render under the finger.
function toggleComparisonRow(button) {
    const accountId = button.dataset.expandAccount;
    const open = !expandedComparisonRows.has(accountId);
    if (open) expandedComparisonRows.add(accountId);
    else expandedComparisonRows.delete(accountId);
    button.setAttribute('aria-expanded', String(open));
    button.closest('.cmp-row')?.classList.toggle('active', open);
    const details = document.getElementById(button.getAttribute('aria-controls'));
    if (details) details.hidden = !open;
}

function formatSignedCurrency(value, masked) {
    const num = Number(value);
    if (!Number.isFinite(num)) return '-';
    if (masked) return formatCurrency(num, true);
    return `${num > 0 ? '+' : ''}${formatCurrency(num)}`;
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
