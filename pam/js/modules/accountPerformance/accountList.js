import { state } from '../../config/state.js';
import { t } from '../../config/i18n.js';
import { escapeHtml, formatCurrency, formatPercent, signedClass } from '../../utils/formatter.js';

export function renderAccountList(metrics) {
    const wrap = document.getElementById('accountList');
    if (!wrap) return;
    const panel = wrap.closest('.account-card-strip-panel');
    panel?.classList.toggle('is-empty', state.accounts.length === 0);

    if (state.accounts.length === 0) {
        wrap.innerHTML = `
            <div class="empty-state account-empty-state">
                <span class="account-empty-mark" aria-hidden="true">+</span>
                <strong>${t('noInvestmentAccounts')}</strong>
                <p>${t('createAccountHint')}</p>
                <button class="primary-btn management-add-btn" type="button" data-action="add-account">${t('addAccount')}</button>
            </div>
        `;
        return;
    }

    const cards = state.accounts.map(account => {
        const metric = metrics.find(item => item.account.id === account.id);
        const active = account.id === state.selectedAccountId;
        const accountSnapshots = state.snapshots
            .filter(snapshot => snapshot.accountId === account.id)
            .sort((a, b) => b.date.localeCompare(a.date));
        const latestSnapshot = accountSnapshots[0];
        const annualizedReturn = calculateAnnualizedReturn(metric);
        return `
            <div class="account-item${active ? ' active' : ''}" draggable="true" data-account-id="${account.id}">
                <button class="account-main" type="button" data-action="select-account" data-account-id="${account.id}">
                    <div class="account-card-heading">
                        <span class="account-card-mark" aria-hidden="true">A</span>
                        <div>
                            <span>${t('assetAccount')}</span>
                            <strong title="${escapeHtml(account.name)}">${escapeHtml(account.name)}</strong>
                            <small>${t('recentlyUpdated')} ${latestSnapshot?.date || t('noSnapshot')}</small>
                        </div>
                    </div>
                    <div class="account-card-metrics">
                        <div><span>${t('totalAssets')}</span><strong>${latestSnapshot ? formatCurrency(latestSnapshot.totalValue, state.amountsHidden) : '-'}</strong></div>
                        <div><span>${t('cumulativeProfit')}</span><strong class="${signedClass(metric?.profitLoss)}">${metric?.valid ? formatCurrency(metric.profitLoss, state.amountsHidden) : '-'}</strong></div>
                        <div><span>${t('annualizedReturn')}</span><strong class="${signedClass(annualizedReturn)}">${Number.isFinite(annualizedReturn) ? formatPercent(annualizedReturn) : '-'}</strong></div>
                    </div>
                </button>
                <details class="account-card-menu">
                    <summary aria-label="${t('accountMenu')}">...</summary>
                    <div>
                        <button type="button" data-action="rename-account" data-account-id="${account.id}">${t('renameAccount')}</button>
                        <button type="button" data-action="delete-account" data-account-id="${account.id}">${t('deleteAccount')}</button>
                    </div>
                </details>
            </div>
        `;
    }).join('');
    wrap.innerHTML = `${cards}${renderAccountSwitcherMobile(metrics)}`;
}

// Phones swap the one-card-at-a-time strip for a row of account chips and a flat summary of the selected
// account, like the allocation stats, so every account is visible and switching is one tap.
function renderAccountSwitcherMobile(metrics) {
    const selected = state.accounts.find(account => account.id === state.selectedAccountId) || state.accounts[0];
    const metric = metrics.find(item => item.account.id === selected.id);
    const latestSnapshot = state.snapshots
        .filter(snapshot => snapshot.accountId === selected.id)
        .reduce((latest, snapshot) => (!latest || snapshot.date > latest.date ? snapshot : latest), null);
    const annualizedReturn = calculateAnnualizedReturn(metric);
    const chips = state.accounts.map(account => {
        const active = account.id === selected.id;
        return `<button class="account-chip${active ? ' active' : ''}" type="button" data-action="select-account" data-account-id="${account.id}" aria-pressed="${active}">${escapeHtml(account.name)}</button>`;
    }).join('');
    const stat = (label, value, className = '') => `<div><dt>${label}</dt><dd class="${className}">${value}</dd></div>`;
    return `
        <div class="account-switcher-mobile">
            <div class="account-chip-row" role="group" aria-label="${escapeHtml(t('assetAccount'))}">${chips}</div>
            <div class="account-summary-mobile">
                <div class="account-summary-head">
                    <strong title="${escapeHtml(selected.name)}">${escapeHtml(selected.name)}</strong>
                    <details class="account-card-menu">
                        <summary aria-label="${t('accountMenu')}">...</summary>
                        <div>
                            <button type="button" data-action="rename-account" data-account-id="${selected.id}">${t('renameAccount')}</button>
                            <button type="button" data-action="delete-account" data-account-id="${selected.id}">${t('deleteAccount')}</button>
                        </div>
                    </details>
                </div>
                <dl class="account-summary-stats">
                    ${stat(t('totalAssets'), latestSnapshot ? formatCurrency(latestSnapshot.totalValue, state.amountsHidden) : '-')}
                    ${stat(t('cumulativeProfit'), metric?.valid ? formatCurrency(metric.profitLoss, state.amountsHidden) : '-', signedClass(metric?.profitLoss))}
                    ${stat(t('annualizedReturn'), Number.isFinite(annualizedReturn) ? formatPercent(annualizedReturn) : '-', signedClass(annualizedReturn))}
                    ${stat(t('recentlyUpdated'), latestSnapshot?.date || t('noSnapshot'))}
                </dl>
            </div>
        </div>
    `;
}

function calculateAnnualizedReturn(metric) {
    if (!metric?.valid || metric.points.length < 2) return null;
    const first = metric.points[0];
    const latest = metric.points[metric.points.length - 1];
    const firstTime = new Date(`${first.date}T00:00:00`).getTime();
    const latestTime = new Date(`${latest.date}T00:00:00`).getTime();
    const days = (latestTime - firstTime) / (24 * 60 * 60 * 1000);
    if (!Number.isFinite(days) || days <= 0 || first.unitNav <= 0 || latest.unitNav <= 0) return null;
    return (Math.pow(latest.unitNav / first.unitNav, 365 / days) - 1) * 100;
}

export function bindAccountList({ onSelect, onRename, onDelete, onAdd, onReorder }) {
    const panel = document.querySelector('.account-card-strip-panel');
    if (!panel) return;
    const list = panel.querySelector('#accountList');
    let draggedAccountId = '';

    panel.addEventListener('click', event => {
        const target = event.target.closest('[data-action]');
        if (!target) return;

        if (target.dataset.action === 'add-account') {
            onAdd();
            return;
        }

        const accountId = target.dataset.accountId;
        if (target.dataset.action === 'select-account') onSelect(accountId);
        if (target.dataset.action === 'rename-account') onRename(accountId);
        if (target.dataset.action === 'delete-account') onDelete(accountId);
    });

    list?.addEventListener('dragstart', event => {
        const item = event.target.closest('.account-item');
        if (!item || !item.dataset.accountId) return;
        if (event.target.closest('.account-card-menu')) {
            event.preventDefault();
            return;
        }
        draggedAccountId = item.dataset.accountId;
        item.classList.add('is-dragging');
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', draggedAccountId);
    });

    list?.addEventListener('dragover', event => {
        if (!draggedAccountId) return;
        const item = event.target.closest('.account-item');
        if (!item || item.dataset.accountId === draggedAccountId) return;
        event.preventDefault();
        clearDropTargets(list);
        item.classList.add(isDropAfter(event, item) ? 'drop-after' : 'drop-before');
        event.dataTransfer.dropEffect = 'move';
    });

    list?.addEventListener('dragleave', event => {
        const item = event.target.closest('.account-item');
        if (!item || item.contains(event.relatedTarget)) return;
        item.classList.remove('drop-before', 'drop-after');
    });

    list?.addEventListener('drop', event => {
        if (!draggedAccountId) return;
        const item = event.target.closest('.account-item');
        if (!item || item.dataset.accountId === draggedAccountId) return;
        event.preventDefault();
        const position = isDropAfter(event, item) ? 'after' : 'before';
        clearDropTargets(list);
        onReorder?.(draggedAccountId, item.dataset.accountId, position);
    });

    list?.addEventListener('dragend', () => {
        draggedAccountId = '';
        list.querySelector('.is-dragging')?.classList.remove('is-dragging');
        clearDropTargets(list);
    });
}

export function scrollAccountCardIntoView(accountId, behavior = 'smooth') {
    const list = document.getElementById('accountList');
    if (!list || !accountId) return;
    scrollAccountChipIntoView(list, accountId, behavior);

    const item = Array.from(list.querySelectorAll('.account-item'))
        .find(element => element.dataset.accountId === accountId);
    if (!item) return;

    const listRect = list.getBoundingClientRect();
    const itemRect = item.getBoundingClientRect();
    const centeredOffset = item.offsetLeft - (list.clientWidth - item.offsetWidth) / 2;
    const maxScrollLeft = list.scrollWidth - list.clientWidth;
    const nextScrollLeft = Math.min(Math.max(0, centeredOffset), maxScrollLeft);

    if (Math.abs(nextScrollLeft - list.scrollLeft) < 1 && itemRect.left >= listRect.left && itemRect.right <= listRect.right) return;
    list.scrollTo({ left: nextScrollLeft, behavior });
}

function scrollAccountChipIntoView(list, accountId, behavior) {
    const row = list.querySelector('.account-chip-row');
    const chip = row && Array.from(row.querySelectorAll('.account-chip')).find(element => element.dataset.accountId === accountId);
    if (!chip || row.clientWidth === 0) return;
    const target = chip.offsetLeft - (row.clientWidth - chip.offsetWidth) / 2;
    row.scrollTo({ left: Math.min(Math.max(0, target), row.scrollWidth - row.clientWidth), behavior });
}

function isDropAfter(event, item) {
    const rect = item.getBoundingClientRect();
    return event.clientX > rect.left + rect.width / 2;
}

function clearDropTargets(list) {
    list.querySelectorAll('.drop-before, .drop-after').forEach(item => {
        item.classList.remove('drop-before', 'drop-after');
    });
}
