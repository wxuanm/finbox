import { state } from '../../config/state.js';
import { t } from '../../config/i18n.js';
import { escapeHtml, formatCurrency } from '../../utils/formatter.js';
import { clampPage, getPageCount, renderPager } from './pager.js';

const SNAPSHOT_PAGE_SIZE = 10;
let currentPage = 1;
// Paging restarts when the account behind the table changes; edits and deletes keep the current page.
let pageAccountId = '';

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
    if (accountId !== pageAccountId) {
        pageAccountId = accountId;
        currentPage = 1;
    }
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

    const pageCount = getPageCount(rows.length, SNAPSHOT_PAGE_SIZE);
    currentPage = clampPage(currentPage, pageCount);
    const visibleRows = rows.slice((currentPage - 1) * SNAPSHOT_PAGE_SIZE, currentPage * SNAPSHOT_PAGE_SIZE);

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
                        <td>${row.date}${renderSourceBadge(row)}</td>
                        <td class="number-cell">${formatCurrency(row.totalValue, state.amountsHidden)}</td>
                        <td class="number-cell">${formatCurrency(row.netFlow, state.amountsHidden)}</td>
                        <td>${escapeHtml(row.note || '-')}</td>
                        <td>
                            <div class="row-actions">
                                <button class="mini-btn icon-btn" type="button" data-action="edit-snapshot" data-snapshot-id="${row.id}" aria-label="${escapeHtml(t('edit'))}" title="${escapeHtml(t('edit'))}">${editIcon()}</button>
                                <button class="mini-btn icon-btn" type="button" data-action="delete-snapshot" data-snapshot-id="${row.id}" aria-label="${escapeHtml(t('delete'))}" title="${escapeHtml(t('delete'))}">${deleteIcon()}</button>
                            </div>
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
        ${pageCount > 1 ? `<div class="snapshot-table-footer">${renderPager(currentPage, pageCount, rows.length)}</div>` : ''}
    `;
}

// Snapshots written by the scheduled job carry no note, so the source badge is the only localized hint.
function renderSourceBadge(row) {
    if (row.source !== 'auto') return '';
    return ` <span class="snapshot-source-badge" title="${escapeHtml(t('autoSnapshotHint'))}">${escapeHtml(t('autoSnapshotBadge'))}</span>`;
}

export function bindSnapshotTable({ onEdit, onDelete }) {
    const wrap = document.getElementById('snapshotTable');
    if (!wrap) return;
    wrap.addEventListener('click', event => {
        const pageButton = event.target.closest('[data-page]');
        if (pageButton) {
            if (pageButton.disabled) return;
            currentPage = Number(pageButton.dataset.page) || 1;
            renderSnapshotTable();
            return;
        }
        const target = event.target.closest('[data-action]');
        if (!target) return;
        if (target.dataset.action === 'edit-snapshot') onEdit(target.dataset.snapshotId);
        if (target.dataset.action === 'delete-snapshot') onDelete(target.dataset.snapshotId);
    });
}

export function bindSnapshotTableAccountSwitch() {
}

function editIcon() {
    return '<svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4.8L19.1 9.7a2.3 2.3 0 0 0 0-3.2l-1.6-1.6a2.3 2.3 0 0 0-3.2 0L4 15.2V20Z" stroke-linejoin="round"/><path d="m13.5 5.7 4.8 4.8" stroke-linecap="round"/></svg>';
}

function deleteIcon() {
    return '<svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14" stroke-linecap="round"/><path d="M10 11v6M14 11v6" stroke-linecap="round"/><path d="M8 7l.6 12.1A2 2 0 0 0 10.6 21h2.8a2 2 0 0 0 2-1.9L16 7" stroke-linejoin="round"/><path d="M9.5 7V5.6A1.6 1.6 0 0 1 11.1 4h1.8a1.6 1.6 0 0 1 1.6 1.6V7" stroke-linejoin="round"/></svg>';
}
