import { state } from '../config/state.js';
import { i18n } from '../config/i18n.js';
import { formatChangeCell } from '../utils/formatter.js';
import { updateDashboardStats } from './dashboard.js';
import { navigateToAnalysis } from './modal.js';
import { saveFundCodes } from '../utils/storage.js';

export function checkEmptyState() {
    const table = document.getElementById('fundTable');
    let emptyTbody = table.querySelector('.empty-state-tbody');
    
    if (shouldShowGlobalEmptyState()) {
        if (!emptyTbody) {
            emptyTbody = document.createElement('tbody');
            emptyTbody.className = 'empty-state-tbody';
            const row = emptyTbody.insertRow();
            const cell = row.insertCell(0);
            cell.colSpan = 9;
            table.appendChild(emptyTbody);
        }
        emptyTbody.rows[0].cells[0].innerHTML = i18n[state.currentLang].emptyState;
        positionGlobalEmptyState(emptyTbody);
    } else {
        if (emptyTbody) emptyTbody.remove();
    }
}

export function updateGroupCounts() {
    const table = document.getElementById('fundTable');
    const tbodies = table.querySelectorAll('tbody.group-section');
    tbodies.forEach(tbody => {
        const rows = tbody.querySelectorAll('tr[id^="fund-"]');
        const countSpan = tbody.querySelector('.group-count');
        if (countSpan) countSpan.textContent = `${rows.length} ${i18n[state.currentLang].items}`;
        syncEmptyGroupRow(tbody);
    });
    syncDefaultGroupVisibility();
}

function hasDefaultFunds() {
    return Array.from(state.fundCodes).some(code => !state.fundGroups[code] || state.fundGroups[code] === 'default');
}

function shouldHideDefaultGroup() {
    return state.groups.some(group => group !== 'default') && !hasDefaultFunds();
}

export function syncDefaultGroupVisibility() {
    const table = document.getElementById('fundTable');
    if (!table) return;

    const defaultBody = table.querySelector('tbody[data-group="default"]');
    if (shouldHideDefaultGroup()) {
        if (defaultBody) defaultBody.remove();
        return;
    }

    if (!defaultBody && state.groups.length === 1 && state.groups[0] === 'default') {
        getOrCreateGroupBody('default');
    }
}

function shouldShowGlobalEmptyState() {
    return state.fundCodes.size === 0 && state.groups.length === 1 && state.groups[0] === 'default';
}

function positionGlobalEmptyState(emptyTbody) {
    const table = document.getElementById('fundTable');
    const defaultBody = table.querySelector('tbody[data-group="default"]');
    if (defaultBody && defaultBody.nextSibling !== emptyTbody) {
        defaultBody.after(emptyTbody);
    }
}

export function getOrCreateGroupBody(groupId, forceVisible = false) {
    const table = document.getElementById('fundTable');
    if (!shouldShowGlobalEmptyState()) {
        table.querySelector('.empty-state-tbody')?.remove();
    }

    let tbody = table.querySelector(`tbody[data-group="${groupId}"]`);
    if (!tbody && groupId === 'default' && shouldHideDefaultGroup() && !forceVisible) {
        return null;
    }
    if (!tbody) {
        tbody = document.createElement('tbody');
        tbody.setAttribute('data-group', groupId);
        tbody.className = 'group-section';
        
        if (state.groupExpanded && state.groupExpanded[groupId] === false) {
            tbody.classList.add('collapsed');
        }

        const displayName = groupId === 'default' ? i18n[state.currentLang].defaultGroup : groupId;
        const defaultNameAttr = groupId === 'default' ? 'data-i18n="defaultGroup"' : '';

        const headerRow = document.createElement('tr');
        headerRow.className = 'group-header';
        headerRow.onclick = () => toggleGroup(groupId);
        headerRow.innerHTML = `
            <td colspan="9">
                <div class="group-header-content">
                    <div class="group-title-area">
                        <div class="group-title-wrap">
                            <span class="expander">▼</span>
                            <strong class="group-name" ${defaultNameAttr}>${displayName}</strong>
                        </div>
                        <span class="group-count">0 ${i18n[state.currentLang].items}</span>
                    </div>
                    <div class="group-actions" onclick="event.stopPropagation()">
                        ${groupId !== 'default' ? `
                        <button class="icon-btn group-add-btn" onclick="showInlineAdd('${groupId}')" title="${i18n[state.currentLang].addBtn}" aria-label="${i18n[state.currentLang].addBtn}"><svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"></path></svg></button>
                        <button class="icon-btn group-menu-btn" onclick="toggleGroupMenu(this)" title="${i18n[state.currentLang].colAction}" aria-label="${i18n[state.currentLang].colAction}">...</button>
                        <div class="group-action-menu">
                            <button onclick="showInlineRename('${groupId}')"><svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg><span data-i18n="renameBtn">${i18n[state.currentLang].renameBtn}</span></button>
                            <button onclick="moveGroup('${groupId}', -1)"><svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 15l7-7 7 7"></path></svg><span data-i18n="moveUpBtn">${i18n[state.currentLang].moveUpBtn}</span></button>
                            <button onclick="moveGroup('${groupId}', 1)"><svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"></path></svg><span data-i18n="moveDownBtn">${i18n[state.currentLang].moveDownBtn}</span></button>
                            <button class="delete-btn" onclick="showInlineDelete('${groupId}')"><svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"></path></svg><span data-i18n="deleteBtn">${i18n[state.currentLang].deleteBtn}</span></button>
                        </div>
                        ` : `
                        <button class="icon-btn group-add-btn" onclick="showInlineAdd('${groupId}')" title="${i18n[state.currentLang].addBtn}" aria-label="${i18n[state.currentLang].addBtn}"><svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"></path></svg></button>
                        `}
                    </div>
                </div>
            </td>
        `;
        tbody.appendChild(headerRow);
        if (groupId !== 'default') {
            appendEmptyGroupRow(tbody);
        }
        table.appendChild(tbody);
        if (groupId === 'default' && shouldShowGlobalEmptyState()) {
            const emptyTbody = table.querySelector('.empty-state-tbody');
            if (emptyTbody) positionGlobalEmptyState(emptyTbody);
        }
    }
    return tbody;
}

function appendEmptyGroupRow(tbody) {
    const row = document.createElement('tr');
    row.className = 'empty-group-row';
    row.innerHTML = `<td colspan="9">${i18n[state.currentLang].emptyGroupState}</td>`;
    tbody.appendChild(row);
}

function syncEmptyGroupRow(tbody) {
    if (tbody.dataset.group === 'default') {
        tbody.querySelector('.empty-group-row')?.remove();
        return;
    }

    const hasFunds = tbody.querySelector('tr[id^="fund-"]');
    let emptyRow = tbody.querySelector('.empty-group-row');

    if (hasFunds) {
        if (emptyRow) emptyRow.remove();
        return;
    }

    if (!emptyRow) {
        appendEmptyGroupRow(tbody);
        emptyRow = tbody.querySelector('.empty-group-row');
    }

    emptyRow.cells[0].innerHTML = i18n[state.currentLang].emptyGroupState;
}

export function showInlineAdd(groupId) {
    closeGroupMenus();

    const table = document.getElementById('fundTable');
    let tbody = table.querySelector(`tbody[data-group="${groupId}"]`);
    if (!tbody && groupId === 'default') {
        tbody = getOrCreateGroupBody('default', true);
    }
    if (!tbody) return;
    
    // Ensure expanded
    tbody.classList.remove('collapsed');
    state.groupExpanded[groupId] = true;

    const existingRow = tbody.querySelector('.group-action-row');
    if (existingRow) {
        const existingInput = existingRow.querySelector('input');
        if (existingInput && existingInput.id === `inlineAdd-${groupId}`) {
            existingInput.focus();
            return;
        }
        existingRow.remove();
    }

    document.querySelectorAll('.fund-detail-row').forEach(detailRow => detailRow.remove());

    if (tbody.querySelector('.inline-add-row')) {
        return;
    }
    
    const tr = document.createElement('tr');
    tr.className = 'inline-add-row group-action-row';
    tr.innerHTML = `
        <td colspan="9" class="inline-add-cell">
            <div class="inline-add-wrap">
                <input type="text" id="inlineAdd-${groupId}" data-i18n-placeholder="inputPlaceholder" placeholder="${i18n[state.currentLang].inputPlaceholder}" onkeydown="if(event.key==='Enter') submitInlineAdd('${groupId}')">
                <button class="primary-btn mini-btn" onclick="submitInlineAdd('${groupId}')" data-i18n="addBtn">${i18n[state.currentLang].addBtn}</button>
                <button class="secondary-btn mini-btn" onclick="this.closest('tr').remove()" data-i18n="cancelBtn">${i18n[state.currentLang].cancelBtn}</button>
            </div>
        </td>
    `;
    
    if (tbody.children.length > 1) {
        tbody.insertBefore(tr, tbody.children[1]);
    } else {
        tbody.appendChild(tr);
    }
    document.getElementById(`inlineAdd-${groupId}`).focus();
}

export function showInlineNewGroup() {
    closeGroupMenus();

    const table = document.getElementById('fundTable');
    if (!table) return;

    const existingRow = table.querySelector('.new-group-section');
    if (existingRow) {
        document.getElementById('inlineNewGroup')?.focus();
        return;
    }

    document.querySelectorAll('.group-action-row, .fund-detail-row').forEach(row => row.remove());

    const tbody = document.createElement('tbody');
    tbody.className = 'new-group-section';
    tbody.innerHTML = `
        <tr class="inline-add-row group-action-row">
            <td colspan="9" class="inline-add-cell">
                <div class="inline-add-wrap">
                    <input type="text" id="inlineNewGroup" data-i18n-placeholder="promptNewGroup" placeholder="${i18n[state.currentLang].promptNewGroup}" onkeydown="if(event.key==='Enter') submitInlineNewGroup()">
                    <button class="primary-btn mini-btn" onclick="submitInlineNewGroup()" data-i18n="addGroupTitle">${i18n[state.currentLang].addGroupTitle}</button>
                    <button class="secondary-btn mini-btn" onclick="this.closest('tbody').remove()" data-i18n="cancelBtn">${i18n[state.currentLang].cancelBtn}</button>
                </div>
            </td>
        </tr>
    `;

    table.insertBefore(tbody, table.tBodies[0] || null);
    document.getElementById('inlineNewGroup').focus();
}

function insertGroupActionRow(groupId, rowClass, contentHtml) {
    closeGroupMenus();

    const table = document.getElementById('fundTable');
    const tbody = table.querySelector(`tbody[data-group="${groupId}"]`);
    if (!tbody) return null;

    tbody.classList.remove('collapsed');
    state.groupExpanded[groupId] = true;
    tbody.querySelector('.group-action-row')?.remove();
    document.querySelectorAll('.fund-detail-row').forEach(detailRow => detailRow.remove());

    const tr = document.createElement('tr');
    tr.className = `inline-add-row group-action-row ${rowClass}`;
    tr.innerHTML = `
        <td colspan="9" class="inline-add-cell">
            ${contentHtml}
        </td>
    `;

    if (tbody.children.length > 1) {
        tbody.insertBefore(tr, tbody.children[1]);
    } else {
        tbody.appendChild(tr);
    }

    return tr;
}

export function showInlineRename(groupId) {
    if (groupId === 'default') return;

    const tr = insertGroupActionRow(groupId, 'inline-rename-row', `
        <div class="inline-add-wrap">
            <input type="text" id="inlineRename-${groupId}" value="${groupId}" onkeydown="if(event.key==='Enter') submitInlineRename('${groupId}')">
            <button class="primary-btn mini-btn" onclick="submitInlineRename('${groupId}')" data-i18n="renameBtn">${i18n[state.currentLang].renameBtn}</button>
            <button class="secondary-btn mini-btn" onclick="this.closest('tr').remove()" data-i18n="cancelBtn">${i18n[state.currentLang].cancelBtn}</button>
        </div>
    `);

    if (tr) {
        const input = document.getElementById(`inlineRename-${groupId}`);
        input.focus();
        input.select();
    }
}

export function showInlineDelete(groupId) {
    if (groupId === 'default') return;

    insertGroupActionRow(groupId, 'inline-delete-row', `
        <div class="inline-confirm-wrap">
            <span class="inline-confirm-copy">${i18n[state.currentLang].confirmDeleteGroup}</span>
            <button class="primary-btn mini-btn danger-mini-btn" onclick="confirmInlineDeleteGroup('${groupId}')" data-i18n="deleteBtn">${i18n[state.currentLang].deleteBtn}</button>
            <button class="secondary-btn mini-btn" onclick="this.closest('tr').remove()" data-i18n="cancelBtn">${i18n[state.currentLang].cancelBtn}</button>
        </div>
    `);
}

function closeGroupMenus() {
    document.querySelectorAll('.group-actions.menu-open').forEach(menu => menu.classList.remove('menu-open'));
}

window.toggleGroupMenu = function(button) {
    const actions = button.closest('.group-actions');
    const isOpen = actions.classList.contains('menu-open');
    closeGroupMenus();
    if (!isOpen) actions.classList.add('menu-open');
};

document.addEventListener('click', closeGroupMenus);

window.submitInlineAdd = function(groupId) {
    const input = document.getElementById(`inlineAdd-${groupId}`);
    if (!input) return;
    const codes = input.value;
    if (codes.trim() !== '') {
        window.addFundCodes(groupId, codes);
    }
    input.closest('tr').remove();
};

window.submitInlineRename = function(oldId) {
    const input = document.getElementById(`inlineRename-${oldId}`);
    if (!input) return;
    const newId = input.value.trim();
    if (newId !== '' && newId !== oldId && window.renameGroup) {
        window.renameGroup(oldId, newId);
    }
    input.closest('tr').remove();
};

window.submitInlineNewGroup = function() {
    const input = document.getElementById('inlineNewGroup');
    if (!input) return;
    const groupName = input.value.trim();
    if (groupName !== '' && window.addGroup) {
        window.addGroup(groupName);
    }
    input.closest('tbody').remove();
};

export function toggleGroup(groupId) {
    const table = document.getElementById('fundTable');
    const tbody = table.querySelector(`tbody[data-group="${groupId}"]`);
    if (tbody) {
        const isCollapsed = tbody.classList.toggle('collapsed');
        state.groupExpanded[groupId] = !isCollapsed;
    }
}

function toggleMobileFundInfo(row) {
    if (!window.matchMedia('(max-width: 768px)').matches) return;

    const code = row.id.replace('fund-', '');
    const nextRow = row.nextElementSibling;

    if (nextRow && nextRow.classList.contains('fund-detail-row')) {
        nextRow.remove();
        return;
    }

    document.querySelectorAll('.fund-detail-row').forEach(detailRow => detailRow.remove());

    const dict = i18n[state.currentLang];
    const detailRow = document.createElement('tr');
    detailRow.className = 'fund-detail-row inline-add-row';
    detailRow.dataset.code = code;
    detailRow.innerHTML = `
        <td colspan="9" class="inline-add-cell">
            <div class="fund-detail-card">
                <div class="fund-detail-title">${row.cells[0].innerHTML}</div>
                <div class="fund-detail-grid">
                    <div class="fund-detail-item"><span>${dict.colEstNav}</span>${row.cells[1].innerHTML}</div>
                    <div class="fund-detail-item"><span>${dict.colEstChange}</span>${row.cells[2].innerHTML}</div>
                    <div class="fund-detail-item"><span>${dict.colNav}</span>${row.cells[3].innerHTML}</div>
                    <div class="fund-detail-item"><span>${dict.colAccNav}</span>${row.cells[4].innerHTML}</div>
                    <div class="fund-detail-item"><span>${dict.colNavChange}</span>${row.cells[5].innerHTML}</div>
                    <div class="fund-detail-item"><span>${dict.colPrevNav}</span>${row.cells[6].innerHTML}</div>
                    <div class="fund-detail-item"><span>${dict.colManager}</span>${row.cells[7].innerHTML}</div>
                </div>
            </div>
        </td>
    `;
    row.after(detailRow);
}

export function updateFundRow(code, fields) {
    const row = document.getElementById(`fund-${code}`);
    if (!row) return;

    const [
        fundCode,
        fundName,
        ,
        ,
        estimatedNav,
        estimatedChange,
        unitNav,
        unitNavDate,
        accumulatedNav,
        navChange,
        previousNav,
        previousNavDate,
        fundManager
    ] = fields;

    const nameCell = row.cells[0];
    nameCell.innerHTML = `
        <div class="name-cell">
            <span class="name-main" title="${fundName || ''}">${fundName || '-'}</span>
            <span class="name-sub">${i18n[state.currentLang].codePrefix} ${fundCode || code}</span>
        </div>
    `;
    nameCell.title = fundName || '';

    row.cells[1].innerHTML = `<span class="value-chip">${estimatedNav || '-'}</span>`;
    row.cells[2].innerHTML = formatChangeCell(estimatedChange);
    row.cells[1].dataset.label = i18n[state.currentLang].colEstNav;
    row.cells[3].dataset.label = i18n[state.currentLang].colNav;
    row.cells[4].dataset.label = i18n[state.currentLang].colAccNav;
    row.cells[5].dataset.label = i18n[state.currentLang].colNavChange;
    row.cells[6].dataset.label = i18n[state.currentLang].colPrevNav;
    row.cells[7].dataset.label = i18n[state.currentLang].colManager;

    row.cells[3].innerHTML = `
        <div class="value-stack">
            <span class="value-chip">${unitNav || '-'}</span>
            <span class="name-sub sub-date">${unitNavDate || '-'}</span>
        </div>`;
    row.cells[4].innerHTML = `<span class="value-chip">${accumulatedNav || '-'}</span>`;
    row.cells[5].innerHTML = formatChangeCell(navChange);
    row.cells[6].innerHTML = `
        <div class="value-stack">
            <span class="value-chip">${previousNav || '-'}</span>
            <span class="name-sub sub-date">${previousNavDate || '-'}</span>
        </div>`;

    const managerCell = row.cells[7];
    managerCell.innerHTML = `<span class="manager-pill" title="${fundManager || ''}">${fundManager || '-'}</span>`;
    managerCell.title = fundManager || '';

    row.classList.remove('loading', 'error-row');
    updateDashboardStats();
}

export function addRow(code) {
    const groupId = state.fundGroups[code] || 'default';
    const tableBody = getOrCreateGroupBody(groupId);
    if (!tableBody) return;
    const row = document.createElement('tr');
    row.id = `fund-${code}`;
    row.classList.add('loading');
    row.onclick = () => toggleMobileFundInfo(row);
    row.ondblclick = () => navigateToAnalysis(code);
    
    row.innerHTML = `
        <td>
            <div class="name-cell">
                <span class="name-main">${i18n[state.currentLang].loading}</span>
                <span class="name-sub">${code}</span>
            </div>
        </td>
        <td class="numerical" data-label="${i18n[state.currentLang].colEstNav}"><div class="loader"></div></td>
        <td class="numerical">-</td>
        <td class="numerical" data-label="${i18n[state.currentLang].colNav}">-</td>
        <td class="numerical" data-label="${i18n[state.currentLang].colAccNav}">-</td>
        <td class="numerical" data-label="${i18n[state.currentLang].colNavChange}">-</td>
        <td class="numerical" data-label="${i18n[state.currentLang].colPrevNav}">-</td>
        <td data-label="${i18n[state.currentLang].colManager}">-</td>
        <td><button class="remove-btn" onclick="event.stopPropagation(); removeFund('${code}')" title="${i18n[state.currentLang].removeTitle}"><svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"></path></svg></button></td>
    `;
    tableBody.appendChild(row);
    checkEmptyState();
    updateGroupCounts();
    updateDashboardStats();
}

export function removeFund(code) {
    if (!confirm(i18n[state.currentLang].confirmRemoveFund)) return;

    state.fundCodes.delete(code);
    delete state.fundGroups[code];
    saveFundCodes();
    const row = document.getElementById(`fund-${code}`);
    if (row) row.remove();
    updateGroupCounts();
    checkEmptyState();
    updateDashboardStats();
}

export function sortTable(column) {
    if (state.currentSortColumn === column) {
        state.sortOrder *= -1;
    } else {
        state.currentSortColumn = column;
        state.sortOrder = 1;
    }
    
    updateSortIcons(column);
    
    const table = document.getElementById('fundTable');
    const tbodies = table.querySelectorAll('tbody.group-section');
    
    tbodies.forEach(tbody => {
        const rows = Array.from(tbody.querySelectorAll('tr[id^="fund-"]'));
        
        rows.sort((a, b) => {
            const isNumeric = a.cells[column].classList.contains('numerical');

            if (isNumeric) {
                const textA = a.cells[column].textContent;
                const textB = b.cells[column].textContent;

                // Use regex to extract the number, ignoring icons and symbols.
                const matchA = textA.match(/-?[\d.]+/);
                const matchB = textB.match(/-?[\d.]+/);

                const numA = matchA ? parseFloat(matchA[0]) : -Infinity;
                const numB = matchB ? parseFloat(matchB[0]) : -Infinity;
                
                return (numA - numB) * state.sortOrder;
            } else {
                const cellA = a.cells[column].textContent.trim();
                const cellB = b.cells[column].textContent.trim();
                return cellA.localeCompare(cellB, 'en', {numeric: true}) * state.sortOrder;
            }
        });
        
        rows.forEach(row => tbody.appendChild(row));
    });
}

function updateSortIcons(column) {
    document.querySelectorAll('#fundTable th').forEach((header, index) => {
        const icon = header.querySelector('.sort-icon');
        if (icon) {
            if (index === column) {
                icon.textContent = state.sortOrder === 1 ? '▲' : '▼';
            } else {
                icon.textContent = '';
            }
        }
    });
}
