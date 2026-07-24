import { state } from '../config/state.js';
import { i18n } from '../config/i18n.js';
import { formatChangeCell } from '../utils/formatter.js';
import { updateDashboardStats } from './dashboard.js';
import { navigateToAnalysis } from './modal.js';
import { saveFundCodes } from '../utils/storage.js';

export function checkEmptyState() {
    const tableBody = document.getElementById('fundTable').tBodies[0];
    if (tableBody.rows.length === 0) {
        const row = tableBody.insertRow();
        const cell = row.insertCell(0);
        cell.colSpan = 12;
        cell.style.textAlign = 'center';
        cell.innerHTML = i18n[state.currentLang].emptyState;
    } else {
        const emptyRow = tableBody.querySelector('td[colspan="12"]');
        if (emptyRow) emptyRow.parentElement.remove();
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

    const nameCell = row.cells[1];
    nameCell.innerHTML = `
        <div class="name-cell">
            <span class="name-main" title="${fundName || ''}">${fundName || '-'}</span>
            <span class="name-sub">${i18n[state.currentLang].codePrefix} ${fundCode || code}</span>
        </div>
    `;
    nameCell.title = fundName || '';

    row.cells[2].innerHTML = `<span class="value-chip">${estimatedNav || '-'}</span>`;
    row.cells[3].innerHTML = formatChangeCell(estimatedChange);
    row.cells[4].innerHTML = `<span class="value-chip">${unitNav || '-'}</span>`;
    row.cells[5].textContent = unitNavDate || '-';
    row.cells[6].innerHTML = `<span class="value-chip">${accumulatedNav || '-'}</span>`;
    row.cells[7].innerHTML = formatChangeCell(navChange);
    row.cells[8].innerHTML = `<span class="value-chip">${previousNav || '-'}</span>`;
    row.cells[9].textContent = previousNavDate || '-';

    const managerCell = row.cells[10];
    managerCell.innerHTML = `<span class="manager-pill" title="${fundManager || ''}">${fundManager || '-'}</span>`;
    managerCell.title = fundManager || '';

    row.classList.remove('loading', 'error-row');
    updateDashboardStats();
}

export function addRow(code) {
    const tableBody = document.getElementById('fundTable').tBodies[0];
    const row = tableBody.insertRow();
    row.id = `fund-${code}`;
    row.classList.add('loading');
    row.ondblclick = () => navigateToAnalysis(code);
    
    row.innerHTML = `
        <td><span class="code-badge">${code}</span></td>
        <td>
            <div class="name-cell">
                <span class="name-main">${i18n[state.currentLang].loading}</span>
                <span class="name-sub">${i18n[state.currentLang].waiting}</span>
            </div>
        </td>
        <td class="numerical"><div class="loader"></div></td>
        <td class="numerical">-</td>
        <td class="numerical">-</td>
        <td>-</td>
        <td class="numerical">-</td>
        <td class="numerical">-</td>
        <td class="numerical">-</td>
        <td>-</td>
        <td>-</td>
        <td><button class="remove-btn" onclick="removeFund('${code}')" title="${i18n[state.currentLang].removeTitle}">✖</button></td>
    `;
    checkEmptyState();
    updateDashboardStats();
}

export function removeFund(code) {
    state.fundCodes.delete(code);
    saveFundCodes(state.fundCodes);
    const row = document.getElementById(`fund-${code}`);
    if (row) row.remove();
    checkEmptyState();
    updateDashboardStats();
}

export function sortTable(column) {
    const tableBody = document.getElementById('fundTable').tBodies[0];
    if (state.currentSortColumn === column) {
        state.sortOrder *= -1;
    } else {
        state.currentSortColumn = column;
        state.sortOrder = 1;
    }
    
    updateSortIcons(column);
    
    const rows = Array.from(tableBody.rows).filter(row => !row.querySelector('td[colspan="12"]'));
    
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
    
    rows.forEach(row => tableBody.appendChild(row));
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
