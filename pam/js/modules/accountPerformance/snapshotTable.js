import { state } from '../../config/state.js';
import { t } from '../../config/i18n.js';
import { escapeHtml, formatCurrency } from '../../utils/formatter.js';

const DEFAULT_SNAPSHOT_LIMIT = 5;
let showAllSnapshots = false;

export function renderSnapshotTable() {
    const wrap = document.getElementById('snapshotTable');
    const context = document.getElementById('snapshotTableContext');
    if (!wrap) return;

    if (state.accounts.length === 0) {
        if (context) context.textContent = t('noViewableAccount');
        wrap.innerHTML = `<div class="empty-state">${t('noAccounts')}</div>`;
        return;
    }

    const accountId = state.selectedAccountId || state.accounts[0]?.id;
    const account = state.accounts.find(item => item.id === accountId);
    const rows = state.snapshots
        .filter(snapshot => snapshot.accountId === accountId)
        .sort((a, b) => b.date.localeCompare(a.date));

    if (context) {
        context.textContent = `${account?.name || t('notSelectedAccount')} · ${rows.length} ${t('assetRecords')}`;
    }

    if (rows.length === 0) {
        wrap.innerHTML = `<div class="empty-state">${escapeHtml(t('currentAccountNoSnapshot', { account: account?.name || t('currentAccount') }))}</div>`;
        return;
    }

    const visibleRows = showAllSnapshots ? rows : rows.slice(0, DEFAULT_SNAPSHOT_LIMIT);
    const hiddenCount = Math.max(rows.length - visibleRows.length, 0);

    wrap.innerHTML = `
        <table class="snapshot-table">
            <thead>
                <tr>
                    <th>${t('date')}</th>
                    <th class="number-cell">${t('totalAssets')}</th>
                    <th class="number-cell">${t('netFlow')}</th>
                    <th>${t('note')}</th>
                    <th>${t('actions')}</th>
                </tr>
            </thead>
            <tbody>
                ${visibleRows.map(row => `
                    <tr>
                        <td>${row.date}</td>
                        <td class="number-cell">${formatCurrency(row.totalValue, state.amountsHidden)}</td>
                        <td class="number-cell">${formatCurrency(row.netFlow, state.amountsHidden)}</td>
                        <td>${escapeHtml(row.note || '-')}</td>
                        <td>
                            <div class="row-actions">
                                <button class="mini-btn" type="button" data-action="edit-snapshot" data-snapshot-id="${row.id}">${t('edit')}</button>
                                <button class="mini-btn" type="button" data-action="delete-snapshot" data-snapshot-id="${row.id}">${t('delete')}</button>
                            </div>
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
        ${rows.length > DEFAULT_SNAPSHOT_LIMIT ? `
            <div class="snapshot-table-footer">
                <button class="mini-btn snapshot-toggle-btn" type="button" data-action="toggle-snapshots">
                    ${showAllSnapshots ? t('collapse') : t('viewAllCount', { count: rows.length })}
                </button>
                ${showAllSnapshots ? '' : `<span>${t('snapshotHiddenSummary', { visible: visibleRows.length, hidden: hiddenCount })}</span>`}
            </div>
        ` : ''}
    `;
}

export function bindSnapshotTable({ onEdit, onDelete }) {
    const wrap = document.getElementById('snapshotTable');
    if (!wrap) return;
    wrap.addEventListener('click', event => {
        const target = event.target.closest('[data-action]');
        if (!target) return;
        if (target.dataset.action === 'toggle-snapshots') {
            showAllSnapshots = !showAllSnapshots;
            renderSnapshotTable();
            return;
        }
        if (target.dataset.action === 'edit-snapshot') onEdit(target.dataset.snapshotId);
        if (target.dataset.action === 'delete-snapshot') onDelete(target.dataset.snapshotId);
    });
}

export function bindSnapshotTableAccountSwitch() {
}
