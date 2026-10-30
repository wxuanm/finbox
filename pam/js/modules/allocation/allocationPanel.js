import { state } from '../../config/state.js';
import { t } from '../../config/i18n.js';
import { escapeHtml, formatCurrency, formatPercent, formatWeight } from '../../utils/formatter.js';
import { getAssetClassLabel } from '../holdings/holdingsMetrics.js';
import { ALLOCATION_CLASSES, buildCashInRebalance, buildDrift, buildFullRebalance } from './allocationMetrics.js';

export const REBALANCE_MODES = [
    ['cashIn', 'allocationModeCashIn'],
    ['full', 'allocationModeFull']
];

// Expanded class rows survive re-renders (privacy toggle, quote refresh) but not a reload.
const expandedClasses = new Set();
// The new-money amount is a scratch input: kept across re-renders, never persisted.
let cashInAmount = '';

// HTML bars, not ECharts: the page must stay usable when the chart CDN fails.
export function renderAllocationPanel(metrics) {
    const targetsBtn = document.getElementById('allocationTargetsBtn');
    if (targetsBtn) targetsBtn.hidden = state.accounts.length === 0;
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

    const { targets, band } = state.allocation;
    const drift = buildDrift(metrics.classes, targets, band);
    const driftByClass = new Map((drift || []).map(item => [item.assetClass, item]));
    const visibleClasses = metrics.classes.filter(item => item.value > 0 || (targets?.[item.assetClass] || 0) > 0);

    el.innerHTML = `
        ${renderStats(metrics, drift)}
        ${renderMissingNotice(metrics)}
        <div class="alloc-main${targets ? ' has-targets' : ''}">
            <section class="alloc-section" aria-labelledby="allocClassTitle">
                <h3 id="allocClassTitle" class="alloc-section-title">${t('allocationClassTitle')}</h3>
                <ul class="alloc-class-list">${visibleClasses.map(item => renderClassRow(item, driftByClass.get(item.assetClass))).join('')}</ul>
                <p class="alloc-footnote">${targets ? `${t('allocationBandNote', { absolute: formatBandNumber(band.absolute), relative: formatBandNumber(band.relative) })} ` : ''}${t('allocationClassNote')}</p>
                ${targets ? '' : renderTargetPrompt()}
            </section>
            ${targets ? renderRebalance(metrics, targets) : ''}
        </div>
        <section class="alloc-section" aria-labelledby="allocAccountTitle">
            <h3 id="allocAccountTitle" class="alloc-section-title">${t('allocationAccountTitle')}</h3>
            ${renderAccountMix(metrics)}
        </section>
    `;
}

function renderTargetPrompt() {
    return `
        <div class="alloc-target-prompt">
            <p>${t('allocationTargetPrompt')}</p>
            <button class="ghost-btn" type="button" data-alloc-action="open-targets">${t('allocationSetTargets')}</button>
        </div>
    `;
}

function renderRebalance(metrics, targets) {
    const mode = state.allocationRebalanceMode;
    const plan = mode === 'full'
        ? buildFullRebalance(metrics.classes, targets)
        : buildCashInRebalance(metrics.classes, targets, cashInAmount === '' ? null : Number(cashInAmount));
    if (!plan) return '';
    const switcher = REBALANCE_MODES.map(([key, label]) => {
        const active = key === mode;
        return `<button class="period-chip${active ? ' active' : ''}" type="button" data-alloc-mode="${key}" aria-pressed="${active}">${t(label)}</button>`;
    }).join('');
    const rows = plan.rows.filter(row => row.value > 0 || targets[row.assetClass] > 0 || Math.abs(row.trade) > 0.005);
    return `
        <section class="alloc-section alloc-rebalance" aria-labelledby="allocRebalanceTitle">
            <div class="alloc-rebalance-head">
                <h3 id="allocRebalanceTitle" class="alloc-section-title">${t('allocationRebalanceTitle')}</h3>
                <div class="period-switch alloc-mode-switch" role="group" aria-label="${escapeHtml(t('allocationRebalanceTitle'))}">${switcher}</div>
            </div>
            ${metrics.staleShare > 0 ? `<p class="alloc-rebalance-warning">⚠ ${t('allocationRebalanceStale', { share: formatWeight(metrics.staleShare) })}</p>` : ''}
            ${metrics.missingAccounts.length > 0 ? `<p class="alloc-rebalance-warning">${t('allocationRebalanceMissing', { count: metrics.missingAccounts.length })}</p>` : ''}
            ${plan.mode === 'cashIn' ? renderCashInSummary(plan) : ''}
            <div class="alloc-table-wrap">
                <table class="alloc-table alloc-rebalance-table">
                    <thead><tr>
                        <th scope="col">${t('assetClass')}</th>
                        <th scope="col" class="number-cell alloc-current-col">${t('allocationCurrentValue')}</th>
                        <th scope="col" class="number-cell alloc-target-col">${t('allocationTargetValue')}</th>
                        <th scope="col" class="number-cell">${t('allocationAdjustment')}</th>
                        <th scope="col" class="number-cell">${t('allocationWeightAfter')}</th>
                    </tr></thead>
                    <tbody>${rows.map(row => `
                        <tr>
                            <th scope="row">${getAssetClassLabel(row.assetClass)}</th>
                            <td class="number-cell alloc-current-col">${formatCurrency(row.value, state.amountsHidden)}</td>
                            <td class="number-cell alloc-target-col">${formatCurrency(row.targetValue, state.amountsHidden)}</td>
                            <td class="number-cell">${renderTrade(row.trade)}</td>
                            <td class="number-cell">${formatWeight(row.weightAfter)}</td>
                        </tr>
                    `).join('')}</tbody>
                </table>
            </div>
            <p class="alloc-footnote">${t('allocationRebalanceDisclaimer')}</p>
        </section>
    `;
}

function renderCashInSummary(plan) {
    const blocked = plan.blocked.length > 0
        ? `<p class="alloc-rebalance-warning">${t('allocationBlocked', { classes: plan.blocked.map(getAssetClassLabel).join('、') })}</p>`
        : '';
    const required = plan.required > 0.005
        ? t('allocationRequired', { value: formatCurrency(plan.required, state.amountsHidden) })
        : t('allocationOnTarget');
    const status = plan.amount === null
        ? required
        : plan.amount < plan.required - 0.005
            ? t('allocationAmountBelow', { value: formatCurrency(plan.required, state.amountsHidden) })
            : required;
    return `
        ${blocked}
        <div class="alloc-cash-in">
            <label>
                <span>${t('allocationNewMoney')}</span>
                <input id="allocationCashInInput" type="number" inputmode="decimal" min="0" step="0.01" value="${escapeHtml(cashInAmount)}" placeholder="${escapeHtml(t('allocationNewMoneyPlaceholder'))}">
            </label>
            <p class="alloc-cash-in-status">${status}</p>
        </div>
    `;
}

function renderTrade(trade) {
    if (Math.abs(trade) < 0.005) return '<span class="alloc-muted">-</span>';
    const label = trade > 0 ? t('allocationBuy') : t('allocationSell');
    return `<span class="alloc-trade ${trade > 0 ? 'buy' : 'sell'}">${label} ${formatCurrency(Math.abs(trade), state.amountsHidden)}</span>`;
}

function formatBandNumber(value) {
    return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));
}

export function bindAllocationPanel({ onGoToAccount, onOpenInclusion, onOpenTargets, onModeChange, onRender }) {
    const content = document.getElementById('allocationContent');
    // Re-rendering on every keystroke would rebuild the input and drop focus, so the amount input
    // re-renders on change (blur or Enter) and the rest of the panel follows.
    content?.addEventListener('change', event => {
        if (event.target.id !== 'allocationCashInInput') return;
        const value = event.target.value.trim();
        const num = Number(value);
        cashInAmount = value === '' || !Number.isFinite(num) || num <= 0 ? '' : value;
        onRender();
        requestAnimationFrame(() => document.getElementById('allocationCashInInput')?.focus());
    });
    content?.addEventListener('keydown', event => {
        if (event.target.id === 'allocationCashInInput' && event.key === 'Enter') {
            event.preventDefault();
            event.target.dispatchEvent(new Event('change', { bubbles: true }));
        }
    });
    content?.addEventListener('click', event => {
        const mode = event.target.closest('[data-alloc-mode]');
        if (mode) {
            onModeChange(mode.dataset.allocMode);
            return;
        }
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
        if (action.dataset.allocAction === 'open-targets') onOpenTargets();
        if (action.dataset.allocAction === 'go-asset-data') onGoToAccount(action.dataset.accountId || '');
    });
}

function renderStats(metrics, drift) {
    const largest = drift
        ? drift.filter(item => item.value > 0 || item.target > 0)
            .reduce((found, item) => (!found || Math.abs(item.drift) > Math.abs(found.drift) ? item : found), null)
        : null;
    const stats = [
        [t('allocationTotal'), formatCurrency(metrics.totalValue, state.amountsHidden), '', ''],
        [t('allocationCoverage'), formatWeight(metrics.coverage), metrics.coverage < 99.995 ? 'warning' : '', ''],
        [
            t('allocationStaleShare'),
            metrics.staleShare > 0 ? `⚠ ${formatWeight(metrics.staleShare)}` : formatWeight(0),
            metrics.staleShare > 0 ? 'warning' : '',
            metrics.staleCount > 0 ? t('allocationStaleCount', { count: metrics.staleCount }) : ''
        ],
        largest ? [
            t('allocationLargestDrift'),
            formatDrift(largest.drift),
            largest.status === 'ok' ? '' : 'warning',
            `${getAssetClassLabel(largest.assetClass)} · ${t(STATUS_LABELS[largest.status])}`
        ] : null
    ].filter(Boolean);
    return `
        <dl class="alloc-stats${stats.length === 4 ? ' four' : ''}">
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

const STATUS_LABELS = { under: 'allocationUnder', ok: 'allocationOk', over: 'allocationOver' };

function formatDrift(drift) {
    return `${formatPercent(drift, 2).replace('%', '')} ${t('allocationPp')}`;
}

function renderClassRow(item, drift) {
    const isOpen = expandedClasses.has(item.assetClass);
    const label = getAssetClassLabel(item.assetClass);
    const holdingsId = `allocHoldings-${item.assetClass}`;
    const hasHoldings = item.holdings.length > 0;
    // The band is drawn on the same 0-100% scale as the bar, clipped to the track.
    const band = drift ? `
        <span class="alloc-band" style="left:${barWidth(drift.target - drift.tolerance)};width:${barWidth(Math.min(100, drift.target + drift.tolerance) - Math.max(0, drift.target - drift.tolerance))}"></span>
        <span class="alloc-target-tick" style="left:${barWidth(drift.target)}"></span>
    ` : '';
    const targetLine = drift ? `
        <span class="alloc-class-target">
            <span>${t('allocationTargetShort', { weight: formatWeight(drift.target) })}</span>
            <span class="alloc-drift">${formatDrift(drift.drift)}</span>
            <span class="alloc-status ${drift.status}">${t(STATUS_LABELS[drift.status])}</span>
        </span>
    ` : '';
    const head = `
        <span class="alloc-class-name">${label}<small>${t('allocationHoldingCount', { count: item.holdings.length })}</small></span>
        <span class="alloc-class-figures">
            <strong>${formatWeight(item.weight || 0)}</strong>
            <small>${formatCurrency(item.value, state.amountsHidden)}</small>
        </span>
        <span class="alloc-bar" aria-hidden="true">${band}<span class="alloc-bar-fill" style="width:${barWidth(item.weight)}"></span></span>
        ${targetLine}
    `;
    // A class with a target but nothing held has no holdings to expand.
    if (!hasHoldings) {
        return `
            <li class="alloc-class-row empty${drift ? ' with-target' : ''}">
                <div class="alloc-class-toggle static">${head}</div>
            </li>
        `;
    }
    return `
        <li class="alloc-class-row${isOpen ? ' expanded' : ''}${drift ? ' with-target' : ''}">
            <button class="alloc-class-toggle" type="button" data-alloc-toggle="${item.assetClass}" aria-expanded="${isOpen}" aria-controls="${holdingsId}">
                ${head}
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
                                <small class="alloc-muted">${escapeHtml(row.accountNames.join('、'))}</small>
                            </td>
                            <td class="alloc-muted alloc-account-col">${escapeHtml(row.accountNames.join('、'))}</td>
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
