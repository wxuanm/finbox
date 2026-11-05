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

// Phones replace the four overview cards with one headline: total assets, the portfolio's period P/L and
// return, then cumulative P/L and data freshness on one line that expands to each account's latest snapshot.
let heroStatusOpen = false;

export function renderReturnsHero(metrics, portfolio) {
    const wrap = document.getElementById('returnsHero');
    if (!wrap) return;
    if (!portfolio) {
        wrap.innerHTML = `
            <span class="returns-hero-label">${escapeHtml(t('latestTotalAssets'))}</span>
            <strong class="returns-hero-value">-</strong>
            <p class="returns-hero-empty">${escapeHtml(t('waitingValidSnapshot'))}</p>
        `;
        return;
    }

    const masked = state.amountsHidden;
    const statusRows = metrics.map(metric => {
        const lagging = metric.valid && metric.latestDate !== portfolio.latestDate;
        const detail = metric.valid ? escapeHtml(metric.latestDate) : escapeHtml(metric.error || t('insufficientData'));
        return `
            <li${metric.valid ? '' : ' class="invalid"'}>
                <span>${escapeHtml(metric.account.name)}</span>
                ${lagging ? `<em class="lag-badge">${escapeHtml(t('laggedBadge'))}</em>` : ''}
                <span class="returns-hero-status-date">${detail}</span>
            </li>
        `;
    }).join('');

    wrap.innerHTML = `
        <span class="returns-hero-label">${escapeHtml(t('returnsHeroTotal', { count: portfolio.accountCount }))}</span>
        <strong class="returns-hero-value">${formatCurrency(portfolio.latestValue, masked)}</strong>
        <div class="returns-hero-period">
            <span class="title-period-badge">${escapeHtml(currentPeriodLabel())}</span>
            <strong class="${signedClass(portfolio.periodProfitLoss)}">${formatSignedCurrency(portfolio.periodProfitLoss, masked)}</strong>
            <span class="returns-hero-pill ${signedClass(portfolio.periodReturn)}">${formatPercent(portfolio.periodReturn)}</span>
        </div>
        <button class="returns-hero-status" type="button" data-hero-status aria-expanded="${heroStatusOpen}" aria-controls="returnsHeroStatusList">
            <span>${escapeHtml(t('cumulativePnl'))} <b class="${signedClass(portfolio.profitLoss)}">${formatSignedCurrency(portfolio.profitLoss, masked)}</b></span>
            <span aria-hidden="true">·</span>
            <span>${escapeHtml(t('returnsHeroStatus', { synced: portfolio.syncedCount, count: portfolio.accountCount, date: portfolio.latestDate }))}</span>
            <svg class="returns-hero-chevron" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
        <ul id="returnsHeroStatusList" class="returns-hero-status-list"${heroStatusOpen ? '' : ' hidden'}>${statusRows}</ul>
    `;
}

export function bindReturnsHero() {
    document.getElementById('returnsHero')?.addEventListener('click', event => {
        const toggle = event.target.closest('[data-hero-status]');
        if (!toggle) return;
        heroStatusOpen = !heroStatusOpen;
        toggle.setAttribute('aria-expanded', String(heroStatusOpen));
        const list = document.getElementById('returnsHeroStatusList');
        if (list) list.hidden = !heroStatusOpen;
    });
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

export function bindAccountComparison({ onHighlight, onOverlay, onSort, onGoToAccount }) {
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
        const overlay = event.target.closest('[data-overlay-account]');
        if (overlay) {
            onOverlay(overlay.dataset.overlayAccount);
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
// absolute return in the list. A tap adds the account's line to the portfolio chart and opens its risk metrics.
const MOBILE_SORT_KEYS = ['periodReturn', 'periodProfitLoss', 'latestValue', 'annualizedReturn', 'maxDrawdown', 'annualizedVolatility', 'calmarRatio', 'profitLoss', 'latestDate', 'name'];

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
        latestDate: t('latestSnapshot'),
        name: t('account')
    }[key];
}

function renderComparisonMobile(sortedMetrics, slotById) {
    const sortKey = state.comparisonSortKey || 'periodReturn';
    const ascending = state.comparisonSortOrder === 1;
    const options = MOBILE_SORT_KEYS
        .map(key => `<option value="${key}"${key === sortKey ? ' selected' : ''}>${escapeHtml(mobileSortLabel(key))}</option>`)
        .join('');
    const valid = sortedMetrics.filter(metric => metric.valid);
    const latestDate = valid.reduce((latest, metric) => metric.latestDate > latest ? metric.latestDate : latest, '');
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
                ${sortedMetrics.map(metric => renderComparisonListRow(metric, slotById.get(metric.account.id) ?? 0, latestDate, barScale)).join('')}
            </ul>
        </div>
    `;
}

function renderComparisonListRow(metric, slot, latestDate, barScale) {
    // Phones overlay any number of accounts on the portfolio chart, so a row is open while its line is drawn.
    const active = state.chartOverlayAccountIds.includes(metric.account.id);
    // The dot doubles as the chart legend on phones, so it uses the same color slot as the line.
    const color = metric.valid ? `var(--chart-series-${(slot % 6) + 1})` : 'var(--border-strong)';
    const lagging = metric.valid && latestDate && metric.latestDate !== latestDate;
    const name = `
        <span class="cmp-row-dot" style="background:${color}" aria-hidden="true"></span>
        <span class="cmp-row-name">
            <strong><span>${escapeHtml(metric.account.name)}</span>${lagging ? `<em class="lag-badge">${escapeHtml(t('laggedBadge'))}</em>` : ''}</strong>
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
        <li class="cmp-row${active ? ' active' : ''}">
            <button class="cmp-row-main" type="button" data-overlay-account="${metric.account.id}" aria-expanded="${active}" aria-controls="${detailsId}">
                ${name}
                <span class="cmp-row-bar" aria-hidden="true"><i class="${tone}" style="${barSide}:50%;width:${barWidth.toFixed(1)}%"></i></span>
                <span class="cmp-row-figures">
                    <strong>${formatMetricPercent(metric, 'periodReturn')}</strong>
                    <small class="${signedClass(metric.periodProfitLoss)}">${formatSignedCurrency(metric.periodProfitLoss, state.amountsHidden)}</small>
                </span>
            </button>
            <div id="${detailsId}" class="cmp-row-expand"${active ? '' : ' hidden'}>
                <dl class="cmp-row-details">
                    ${stat(t('annualizedReturn'), formatMetricPercent(metric, 'annualizedReturn'))}
                    ${stat(t('maxDrawdown'), formatMetricPercent(metric, 'maxDrawdown'))}
                    ${stat(t('annualizedVolatility'), formatMetricPercent(metric, 'annualizedVolatility', false))}
                    ${stat(t('calmarRatio'), formatMetricRatio(metric, 'calmarRatio'))}
                </dl>
                <div class="cmp-row-foot">
                    <span>${t('cumulativePnl')} ${formatMetricCurrency(metric, 'profitLoss')} · ${escapeHtml(metric.latestDate || '-')}</span>
                    <button class="cmp-row-goto" type="button" data-goto-account="${metric.account.id}">${escapeHtml(t('goToAccount'))}</button>
                </div>
            </div>
        </li>
    `;
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
