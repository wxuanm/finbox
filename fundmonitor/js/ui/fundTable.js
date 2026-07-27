import { state } from '../config/state.js';
import { i18n } from '../config/i18n.js';
import { formatChangeCell } from '../utils/formatter.js';
import { updateDashboardStats } from './dashboard.js';
import { navigateToAnalysis } from './modal.js';
import { saveFundCodes } from '../utils/storage.js';

export function checkEmptyState() {
    const table = document.getElementById('fundTable');
    let emptyTbody = table.querySelector('.empty-state-tbody');
    
    if (state.fundCodes.size === 0) {
        if (!emptyTbody) {
            emptyTbody = document.createElement('tbody');
            emptyTbody.className = 'empty-state-tbody';
            const row = emptyTbody.insertRow();
            const cell = row.insertCell(0);
            cell.colSpan = 9;
            table.appendChild(emptyTbody);
        }
        emptyTbody.rows[0].cells[0].innerHTML = i18n[state.currentLang].emptyState;
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
    });
}

export function getOrCreateGroupBody(groupId) {
    const table = document.getElementById('fundTable');
    let tbody = table.querySelector(`tbody[data-group="${groupId}"]`);
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
                        <button class="icon-btn" onclick="showInlineAdd('${groupId}')" data-i18n-title="addBtn" title="${i18n[state.currentLang].addBtn}" aria-label="${i18n[state.currentLang].addBtn}"><svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"></path></svg></button>
                        ${groupId !== 'default' ? `
                            <button class="icon-btn" onclick="promptRenameGroup('${groupId}')" data-i18n-title="renameBtn" title="${i18n[state.currentLang].renameBtn}" aria-label="${i18n[state.currentLang].renameBtn}"><svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg></button>
                            <button class="icon-btn delete-btn" onclick="deleteGroup('${groupId}')" data-i18n-title="deleteBtn" title="${i18n[state.currentLang].deleteBtn}" aria-label="${i18n[state.currentLang].deleteBtn}"><svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"></path></svg></button>
                        ` : ''}
                    </div>
                </div>
            </td>
        `;
        tbody.appendChild(headerRow);
        table.appendChild(tbody);
    }
    return tbody;
}

export function showInlineAdd(groupId) {
    const table = document.getElementById('fundTable');
    const tbody = table.querySelector(`tbody[data-group="${groupId}"]`);
    if (!tbody) return;
    
    // Ensure expanded
    tbody.classList.remove('collapsed');
    state.groupExpanded[groupId] = true;

    if (tbody.querySelector('.inline-add-row')) {
        document.getElementById(`inlineAdd-${groupId}`).focus();
        return;
    }
    
    const tr = document.createElement('tr');
    tr.className = 'inline-add-row';
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

window.submitInlineAdd = function(groupId) {
    const input = document.getElementById(`inlineAdd-${groupId}`);
    if (!input) return;
    const codes = input.value;
    if (codes.trim() !== '') {
        window.addFundCodes(groupId, codes);
    }
    input.closest('tr').remove();
};

export function toggleGroup(groupId) {
    const table = document.getElementById('fundTable');
    const tbody = table.querySelector(`tbody[data-group="${groupId}"]`);
    if (tbody) {
        const isCollapsed = tbody.classList.toggle('collapsed');
        state.groupExpanded[groupId] = !isCollapsed;
    }
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
    const row = document.createElement('tr');
    row.id = `fund-${code}`;
    row.classList.add('loading');
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
        <td class="numerical">-</td>
        <td class="numerical">-</td>
        <td class="numerical">-</td>
        <td>-</td>
        <td><button class="remove-btn" onclick="removeFund('${code}')" title="${i18n[state.currentLang].removeTitle}"><svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"></path></svg></button></td>
    `;
    tableBody.appendChild(row);
    checkEmptyState();
    updateGroupCounts();
    updateDashboardStats();
}

export function removeFund(code) {
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
