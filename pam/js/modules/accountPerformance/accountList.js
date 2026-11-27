import { state } from '../../config/state.js';
import { t } from '../../config/i18n.js';
import { escapeHtml, formatCurrency, formatPercent, signedClass } from '../../utils/formatter.js';

// 账户管理 summary: four 资产配置-style tiles across all accounts (total assets, period P/L, period return,
// and how many accounts share the latest snapshot date). Tiles drop to two columns on phones via CSS.
export function renderAccountSummary(metrics, portfolio) {
    const el = document.getElementById('accountSummary');
    if (!el) return;
    el.hidden = state.accounts.length === 0;
    if (state.accounts.length === 0) {
        el.innerHTML = '';
        return;
    }
    const masked = state.amountsHidden;
    const valid = metrics.filter(metric => metric.valid);
    const latestValue = valid.reduce((sum, metric) => sum + metric.latestValue, 0);
    const latestDate = valid.reduce((latest, metric) => (metric.latestDate > latest ? metric.latestDate : latest), '');
    const syncedCount = latestDate ? valid.filter(metric => metric.latestDate === latestDate).length : 0;
    const tile = (label, value, tone, hint) => `
        <div>
            <dt>${escapeHtml(label)}</dt>
            <dd><strong class="${tone}">${value}</strong><small>${hint}</small></dd>
        </div>
    `;
    el.innerHTML = [
        tile(
            t('latestTotalAssets'),
            formatCurrency(latestValue, masked),
            '',
            escapeHtml(t('validAccountsTotal'))
        ),
        tile(
            t('periodPnl'),
            portfolio ? formatSignedCurrency(portfolio.periodProfitLoss, masked) : '-',
            signedClass(portfolio?.periodProfitLoss),
            escapeHtml(t('periodPnl'))
        ),
        tile(
            t('periodReturn'),
            portfolio ? formatPercent(portfolio.periodReturn) : '-',
            signedClass(portfolio?.periodReturn),
            escapeHtml(t('periodReturn'))
        ),
        tile(
            t('accountCount'),
            String(state.accounts.length),
            '',
            latestDate ? `${escapeHtml(latestDate)} · ${syncedCount}` : '-'
        )
    ].join('');
}

function formatSignedCurrency(value, masked = false) {
    const num = Number(value);
    if (masked || !Number.isFinite(num)) return formatCurrency(num, masked);
    return `${num > 0 ? '+' : ''}${formatCurrency(num)}`;
}

// Account list: one bordered list, a row per account, the selected row highlighted. Rows stay draggable on
// desktop, and each row's `...` menu holds rename and delete. Phones show the same rows, with the figures
// stacked under the name, and the chip bar above the view picks the account.
export function renderAccountList(metrics) {
    const wrap = document.getElementById('accountList');
    if (!wrap) return;
    const panel = wrap.closest('.account-card-strip-panel');
    panel?.classList.toggle('is-empty', state.accounts.length === 0);
    renderAccountSwitchBar();

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

    const rows = state.accounts.map(account => {
        const metric = metrics.find(item => item.account.id === account.id);
        const active = account.id === state.selectedAccountId;
        const latestSnapshot = latestSnapshotOf(account.id);
        const annualizedReturn = calculateAnnualizedReturn(metric);
        return `
            <li class="account-item${active ? ' active' : ''}" draggable="true" data-account-id="${account.id}">
                <button class="account-main" type="button" data-action="select-account" data-account-id="${account.id}" aria-pressed="${active}">
                    <span class="account-row-name">
                        <strong title="${escapeHtml(account.name)}">${escapeHtml(account.name)}</strong>
                        <small>${t('recentlyUpdated')} ${latestSnapshot?.date || t('noSnapshot')}</small>
                    </span>
                    <span class="account-row-figures">
                        <span class="account-row-cell"><span>${t('totalAssets')}</span><strong>${latestSnapshot ? formatCurrency(latestSnapshot.totalValue, state.amountsHidden) : '-'}</strong></span>
                        <span class="account-row-cell"><span>${t('cumulativeProfit')}</span><strong class="${signedClass(metric?.profitLoss)}">${metric?.valid ? formatCurrency(metric.profitLoss, state.amountsHidden) : '-'}</strong></span>
                        <span class="account-row-cell"><span>${t('annualizedReturn')}</span><strong class="${signedClass(annualizedReturn)}">${Number.isFinite(annualizedReturn) ? formatPercent(annualizedReturn) : '-'}</strong></span>
                    </span>
                </button>
                <details class="account-card-menu">
                    <summary aria-label="${t('accountMenu')}">...</summary>
                    <div>
                        <button type="button" data-action="rename-account" data-account-id="${account.id}">${t('renameAccount')}</button>
                        <button type="button" data-action="delete-account" data-account-id="${account.id}">${t('deleteAccount')}</button>
                    </div>
                </details>
            </li>
        `;
    }).join('');
    wrap.innerHTML = `<ul class="account-rows">${rows}</ul>`;
}

// The chip bar is the phone account picker. It is hidden while there are no accounts.
function renderAccountSwitchBar() {
    const wrap = document.getElementById('accountSwitchBar');
    if (!wrap) return;
    const bar = wrap.closest('.account-switch-bar');
    if (bar) bar.hidden = state.accounts.length === 0;
    const selectedId = state.accounts.some(account => account.id === state.selectedAccountId)
        ? state.selectedAccountId
        : state.accounts[0]?.id;
    wrap.innerHTML = state.accounts.map(account => {
        const active = account.id === selectedId;
        return `<button class="period-chip account-chip${active ? ' active' : ''}" type="button" data-action="select-account" data-account-id="${account.id}" aria-pressed="${active}">${escapeHtml(account.name)}</button>`;
    }).join('');
}

function latestSnapshotOf(accountId) {
    return state.snapshots
        .filter(snapshot => snapshot.accountId === accountId)
        .reduce((latest, snapshot) => (!latest || snapshot.date > latest.date ? snapshot : latest), null);
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

    document.getElementById('accountSwitchBar')?.addEventListener('click', event => {
        const chip = event.target.closest('[data-action="select-account"]');
        if (!chip) return;
        onSelect(chip.dataset.accountId);
        // The chips are re-rendered; keep keyboard focus on the chosen one.
        document.querySelector(`#accountSwitchBar [data-account-id="${CSS.escape(chip.dataset.accountId)}"]`)?.focus({ preventScroll: true });
    });

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

// Keeps the selected row in view: the phone chip bar scrolls sideways, and the list scrolls vertically.
export function scrollAccountCardIntoView(accountId, behavior = 'smooth') {
    if (!accountId) return;
    scrollAccountChipIntoView(accountId, behavior);
    const item = Array.from(document.querySelectorAll('#accountList .account-item'))
        .find(element => element.dataset.accountId === accountId);
    item?.scrollIntoView({ block: 'nearest', behavior });
}

function scrollAccountChipIntoView(accountId, behavior) {
    const row = document.getElementById('accountSwitchBar');
    const chip = row && Array.from(row.querySelectorAll('.account-chip')).find(element => element.dataset.accountId === accountId);
    if (!chip || row.clientWidth === 0) return;
    const target = chip.offsetLeft - (row.clientWidth - chip.offsetWidth) / 2;
    row.scrollTo({ left: Math.min(Math.max(0, target), row.scrollWidth - row.clientWidth), behavior });
}

function isDropAfter(event, item) {
    const rect = item.getBoundingClientRect();
    return event.clientY > rect.top + rect.height / 2;
}

function clearDropTargets(list) {
    list.querySelectorAll('.drop-before, .drop-after').forEach(item => {
        item.classList.remove('drop-before', 'drop-after');
    });
}
