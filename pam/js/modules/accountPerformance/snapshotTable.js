import { state } from '../../config/state.js';
import { t } from '../../config/i18n.js';
import { escapeHtml, formatCurrency } from '../../utils/formatter.js';
import { LIST_HALF_START_CLASS, clampPage, getListColumnCount, getPageCount, keepFirstRowPage, pairRows, renderPager } from './pager.js';

// Rows per column; a desktop page pairs two columns in one table, like the account trend list.
const SNAPSHOT_COLUMN_SIZE = 10;
// Two records with their action buttons need about 950px, so the table pairs rows only on wider screens.
const SNAPSHOT_SINGLE_COLUMN_QUERY = '(max-width: 1079px)';
let currentPage = 1;
// Columns rendered by the last render, so crossing the phone breakpoint can re-page the table.
let renderedColumnCount = 0;
// Paging restarts when the account behind the table changes; edits and deletes keep the current page.
let pageAccountId = '';
// Expanded phone rows survive re-renders (privacy toggle, paging) but not a reload, like holdings.
const expandedSnapshots = new Set();

export function renderSnapshotTable() {
    const wrap = document.getElementById('snapshotTable');
    const context = document.getElementById('snapshotTableContext');
    if (!wrap) return;

    renderedColumnCount = 0;
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

    const columnCount = getListColumnCount(SNAPSHOT_SINGLE_COLUMN_QUERY);
    const pageSize = SNAPSHOT_COLUMN_SIZE * columnCount;
    const pageCount = getPageCount(rows.length, pageSize);
    currentPage = clampPage(currentPage, pageCount);
    const visibleRows = rows.slice((currentPage - 1) * pageSize, currentPage * pageSize);
    renderedColumnCount = columnCount;

    wrap.innerHTML = `
        <table class="snapshot-table${columnCount > 1 ? ' two-columns' : ''}">
            <thead>
                <tr>${renderHeader(false)}${columnCount > 1 ? renderHeader(true) : ''}</tr>
            </thead>
            <tbody>
                ${pairRows(visibleRows, columnCount).map(([left, right]) => `
                    <tr>
                        ${renderCells(left, false)}
                        ${columnCount > 1 ? (right ? renderCells(right, true) : `<td class="${LIST_HALF_START_CLASS}" colspan="5"></td>`) : ''}
                    </tr>
                `).join('')}
            </tbody>
        </table>
        <ul class="snapshot-list">${visibleRows.map(renderListRow).join('')}</ul>
        ${pageCount > 1 ? `<div class="snapshot-table-footer">${renderPager(currentPage, pageCount, rows.length)}</div>` : ''}
    `;
}

export function resizeSnapshotTable() {
    const columnCount = getListColumnCount(SNAPSHOT_SINGLE_COLUMN_QUERY);
    if (!renderedColumnCount || columnCount === renderedColumnCount) return;
    currentPage = keepFirstRowPage(currentPage, renderedColumnCount, columnCount);
    renderSnapshotTable();
}

function renderHeader(halfStart) {
    return `
        <th class="snapshot-date-cell${halfStart ? ` ${LIST_HALF_START_CLASS}` : ''}">${t('date')}</th>
        <th class="snapshot-value-cell number-cell">${t('totalAssets')}</th>
        <th class="snapshot-value-cell number-cell">${t('netFlow')}</th>
        <th class="snapshot-note-cell">${t('note')}</th>
        <th class="snapshot-actions-cell">${t('actions')}</th>
    `;
}

function renderCells(row, halfStart) {
    return `
        <td class="snapshot-date-cell${halfStart ? ` ${LIST_HALF_START_CLASS}` : ''}">${row.date}${renderSourceBadge(row)}</td>
        <td class="snapshot-value-cell number-cell">${formatCurrency(row.totalValue, state.amountsHidden)}</td>
        <td class="snapshot-value-cell number-cell">${formatCurrency(row.netFlow, state.amountsHidden)}</td>
        <td class="snapshot-note-cell" title="${escapeHtml(row.note || '')}">${escapeHtml(row.note || '-')}</td>
        <td class="snapshot-actions-cell">
            <div class="row-actions">
                <button class="mini-btn icon-btn" type="button" data-action="edit-snapshot" data-snapshot-id="${row.id}" aria-label="${escapeHtml(t('edit'))}" title="${escapeHtml(t('edit'))}">${editIcon()}</button>
                <button class="mini-btn icon-btn" type="button" data-action="delete-snapshot" data-snapshot-id="${row.id}" aria-label="${escapeHtml(t('delete'))}" title="${escapeHtml(t('delete'))}">${deleteIcon()}</button>
            </div>
        </td>
    `;
}

// Phones get divided rows like the holdings list: date and total assets on one line, net flow and note
// beneath only when they say something, and edit/delete behind a tap.
function renderListRow(row) {
    const isOpen = expandedSnapshots.has(row.id);
    const detailsId = `snapshotDetails-${row.id}`;
    const flow = Number(row.netFlow) || 0;
    const meta = [];
    if (flow !== 0) meta.push(`<span class="${flow > 0 ? 'positive' : 'negative'}">${escapeHtml(t('netFlow'))} ${formatSignedFlow(flow)}</span>`);
    if (row.note) meta.push(`<span class="snapshot-row-note">${escapeHtml(row.note)}</span>`);
    return `
        <li class="snapshot-row${isOpen ? ' expanded' : ''}">
            <button class="snapshot-row-toggle" type="button" data-snapshot-toggle="${row.id}" aria-expanded="${isOpen}" aria-controls="${detailsId}">
                <span class="snapshot-row-date">${row.date}${renderSourceBadge(row)}</span>
                <strong class="snapshot-row-value">${formatCurrency(row.totalValue, state.amountsHidden)}</strong>
                ${meta.length ? `<span class="snapshot-row-meta">${meta.join('<i aria-hidden="true">·</i>')}</span>` : ''}
                <svg class="snapshot-row-chevron" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
            <div id="${detailsId}" class="snapshot-row-actions"${isOpen ? '' : ' hidden'}>
                <button class="ghost-btn" type="button" data-action="edit-snapshot" data-snapshot-id="${row.id}">${editIcon()}<span>${escapeHtml(t('edit'))}</span></button>
                <button class="ghost-btn" type="button" data-action="delete-snapshot" data-snapshot-id="${row.id}">${deleteIcon()}<span>${escapeHtml(t('delete'))}</span></button>
            </div>
        </li>
    `;
}

function formatSignedFlow(value) {
    if (state.amountsHidden) return formatCurrency(value, true);
    return `${value > 0 ? '+' : ''}${formatCurrency(value)}`;
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
        const toggle = event.target.closest('[data-snapshot-toggle]');
        if (toggle) {
            const id = toggle.dataset.snapshotToggle;
            const isOpen = !expandedSnapshots.has(id);
            if (isOpen) expandedSnapshots.add(id);
            else expandedSnapshots.delete(id);
            toggle.closest('.snapshot-row')?.classList.toggle('expanded', isOpen);
            toggle.setAttribute('aria-expanded', String(isOpen));
            document.getElementById(`snapshotDetails-${id}`)?.toggleAttribute('hidden', !isOpen);
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
