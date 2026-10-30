import { state } from '../../config/state.js';
import { t } from '../../config/i18n.js';
import { escapeHtml, formatCurrency, formatWeight } from '../../utils/formatter.js';
import { getAssetClassLabel } from '../holdings/holdingsMetrics.js';
import { ALLOCATION_CLASSES } from './allocationMetrics.js';

// Expanded class rows survive re-renders (privacy toggle, quote refresh) but not a reload.
const expandedClasses = new Set();

// HTML bars, not ECharts: the page must stay usable when the chart CDN fails.
export function renderAllocationPanel(metrics) {
    const el = document.getElementById('allocationContent');
    const scope = document.getElementById('allocationScope');
    if (!el) return;
    if (scope) {
        scope.textContent = state.accounts.length > 0
            ? t('allocationScope', { included: metrics.includedCount, total: state.accounts.length })
            : '';
        scope.hidden = state.accounts.length === 0;
    }

    if (state.accounts.length === 0) {
        el.innerHTML = renderEmpty(t('allocationNoAccounts'), 'go-asset-data', t('allocationGoAssetData'));
        return;
    }
    if (metrics.includedCount === 0) {
        el.innerHTML = renderEmpty(t('allocationAllExcluded'), 'open-inclusion', t('allocationIncludeAccounts'));
        return;
    }
    if (metrics.totalValue <= 0) {
        el.innerHTML = `${renderMissingNotice(metrics)}${renderEmpty(t('allocationNoHoldings'), 'go-asset-data', t('allocationGoAssetData'))}`;
        return;
    }

    el.innerHTML = `
        ${renderStats(metrics)}
        ${renderMissingNotice(metrics)}
        <section class="alloc-section" aria-labelledby="allocClassTitle">
            <h3 id="allocClassTitle" class="alloc-section-title">${t('allocationClassTitle')}</h3>
            <ul class="alloc-class-list">${metrics.classes.filter(item => item.value > 0).map(renderClassRow).join('')}</ul>
            <p class="alloc-footnote">${t('allocationClassNote')}</p>
        </section>
        <section class="alloc-section" aria-labelledby="allocAccountTitle">
            <h3 id="allocAccountTitle" class="alloc-section-title">${t('allocationAccountTitle')}</h3>
            ${renderAccountMix(metrics)}
        </section>
    `;
}

export function bindAllocationPanel({ onGoToAccount, onOpenInclusion }) {
    document.getElementById('allocationContent')?.addEventListener('click', event => {
        const toggle = event.target.closest('[data-alloc-toggle]');
        if (toggle) {
            const assetClass = toggle.dataset.allocToggle;
            const row = toggle.closest('.alloc-class-row');
            const isOpen = !expandedClasses.has(assetClass);
            if (isOpen) expandedClasses.add(assetClass);
            else expandedClasses.delete(assetClass);
            row?.classList.toggle('expanded', isOpen);
            toggle.setAttribute('aria-expanded', String(isOpen));
            row?.querySelector('.alloc-holdings')?.toggleAttribute('hidden', !isOpen);
            return;
        }
        const action = event.target.closest('[data-alloc-action]');
        if (!action) return;
        if (action.dataset.allocAction === 'open-inclusion') onOpenInclusion();
        if (action.dataset.allocAction === 'go-asset-data') onGoToAccount(action.dataset.accountId || '');
    });
}

function renderStats(metrics) {
    const stats = [
        [t('allocationTotal'), formatCurrency(metrics.totalValue, state.amountsHidden), '', ''],
        [t('allocationCoverage'), formatWeight(metrics.coverage), metrics.coverage < 99.995 ? 'warning' : '', ''],
        [
            t('allocationStaleShare'),
            metrics.staleShare > 0 ? `⚠ ${formatWeight(metrics.staleShare)}` : formatWeight(0),
            metrics.staleShare > 0 ? 'warning' : '',
            metrics.staleCount > 0 ? t('allocationStaleCount', { count: metrics.staleCount }) : ''
        ]
    ];
    return `
        <dl class="alloc-stats">
            ${stats.map(([label, value, tone, hint]) => `
                <div>
                    <dt>${label}</dt>
                    <dd><strong class="${tone}">${value}</strong>${hint ? `<small>${hint}</small>` : ''}</dd>
                </div>
            `).join('')}
        </dl>
    `;
}

function renderMissingNotice(metrics) {
    if (metrics.missingAccounts.length === 0) return '';
    const names = metrics.missingAccounts
        .map(item => `${escapeHtml(item.account.name)} <small>${escapeHtml(item.date)}</small>`)
        .join('、');
    const first = metrics.missingAccounts[0].account.id;
    return `
        <div class="alloc-notice" role="status">
            <p><strong>${t('allocationMissingTitle', { count: metrics.missingAccounts.length })}</strong>${t('allocationMissingDetail')}</p>
            <p class="alloc-notice-names">${names}</p>
            <button class="ghost-btn alloc-notice-action" type="button" data-alloc-action="go-asset-data" data-account-id="${escapeHtml(first)}">${t('allocationAddHoldings')}</button>
        </div>
    `;
}

function renderClassRow(item) {
    const isOpen = expandedClasses.has(item.assetClass);
    const label = getAssetClassLabel(item.assetClass);
    const holdingsId = `allocHoldings-${item.assetClass}`;
    return `
        <li class="alloc-class-row${isOpen ? ' expanded' : ''}">
            <button class="alloc-class-toggle" type="button" data-alloc-toggle="${item.assetClass}" aria-expanded="${isOpen}" aria-controls="${holdingsId}">
                <span class="alloc-class-name">${label}<small>${t('allocationHoldingCount', { count: item.holdings.length })}</small></span>
                <span class="alloc-class-figures">
                    <strong>${formatWeight(item.weight)}</strong>
                    <small>${formatCurrency(item.value, state.amountsHidden)}</small>
                </span>
                <span class="alloc-bar" aria-hidden="true"><span style="width:${barWidth(item.weight)}"></span></span>
                <svg class="alloc-chevron" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
            <div id="${holdingsId}" class="alloc-holdings"${isOpen ? '' : ' hidden'}>
                <table class="alloc-table alloc-holding-table">
                    <thead><tr>
                        <th scope="col">${t('name')}</th>
                        <th scope="col" class="alloc-account-col">${t('account')}</th>
                        <th scope="col" class="number-cell">${t('marketValue')}</th>
                        <th scope="col" class="number-cell">${t('allocationWeightOfTotal')}</th>
                    </tr></thead>
                    <tbody>${item.holdings.map(row => `
                        <tr>
                            <td class="alloc-holding-name">
                                <span>${row.stale ? `<span class="alloc-stale" title="${escapeHtml(t('stale'))}">⚠</span> ` : ''}${escapeHtml(row.name)}</span>
                                <small class="alloc-muted">${escapeHtml(row.accountName)}</small>
                            </td>
                            <td class="alloc-muted alloc-account-col">${escapeHtml(row.accountName)}</td>
                            <td class="number-cell">${formatCurrency(row.marketValue, state.amountsHidden)}</td>
                            <td class="number-cell">${formatWeight(row.weight)}</td>
                        </tr>
                    `).join('')}</tbody>
                </table>
            </div>
        </li>
    `;
}

// A weight table rather than stacked bars: an account can hold any subset of classes, so any two
// class colors could sit side by side, and no five-hue set separates every pair for CVD readers.
function renderAccountMix(metrics) {
    const visibleClasses = ALLOCATION_CLASSES.filter(assetClass => metrics.classes.some(item => item.assetClass === assetClass && item.value > 0));
    const header = visibleClasses.map(assetClass => `<th scope="col" class="number-cell">${getAssetClassLabel(assetClass)}</th>`).join('');
    const mixRows = metrics.accountMix.map(entry => `
        <tr>
            <th scope="row">${escapeHtml(entry.account.name)}</th>
            <td class="number-cell alloc-account-total">${formatCurrency(entry.value, state.amountsHidden)}</td>
            ${visibleClasses.map(assetClass => {
                const cell = entry.classes.find(item => item.assetClass === assetClass);
                return cell?.value > 0
                    ? `<td class="number-cell"><span class="alloc-cell" style="--alloc-weight:${barWidth(cell.weight)}">${formatWeight(cell.weight)}</span></td>`
                    : '<td class="number-cell alloc-muted">-</td>';
            }).join('')}
        </tr>
    `).join('');
    const missingRows = metrics.missingAccounts.map(item => `
        <tr class="alloc-missing-row">
            <th scope="row">${escapeHtml(item.account.name)}</th>
            <td class="number-cell alloc-account-total">${formatCurrency(item.value, state.amountsHidden)}</td>
            <td class="alloc-muted" colspan="${visibleClasses.length}">${t('allocationNoHoldingsShort')}</td>
        </tr>
    `).join('');
    return `
        <div class="alloc-table-wrap">
            <table class="alloc-table alloc-mix-table">
                <thead><tr>
                    <th scope="col">${t('account')}</th>
                    <th scope="col" class="number-cell">${t('allocationAccountValue')}</th>
                    ${header}
                </tr></thead>
                <tbody>${mixRows}${missingRows}</tbody>
            </table>
        </div>
    `;
}

function renderEmpty(message, action, label) {
    return `
        <div class="empty-state alloc-empty">
            <div>
                <p>${message}</p>
                <button class="primary-btn" type="button" data-alloc-action="${action}">${label}</button>
            </div>
        </div>
    `;
}

function barWidth(weight) {
    const num = Number(weight);
    return `${Number.isFinite(num) ? Math.min(100, Math.max(0, num)) : 0}%`;
}
