import { state } from './config/state.js';
import { i18n } from './config/i18n.js';
import { applyTheme, toggleTheme } from './core/theme.js';
import { loadSavedFundCodes, saveFundCodes } from './utils/storage.js';
import { checkEmptyState, addRow, removeFund, sortTable } from './ui/fundTable.js';
import { updateDashboardStats, updateLastRefreshTime } from './ui/dashboard.js';
import { fetchDataForCode } from './api/fundApi.js';
import { closeModal, initModalListeners, navigateToAnalysis } from './ui/modal.js';

// --- Globalization & Theme ---
function applyLanguage() {
    document.getElementById('pageTitle').textContent = i18n[state.currentLang].title;
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (i18n[state.currentLang][key]) el.innerHTML = i18n[state.currentLang][key];
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        if (i18n[state.currentLang][key]) el.placeholder = i18n[state.currentLang][key];
    });
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
        const key = el.getAttribute('data-i18n-title');
        if (i18n[state.currentLang][key]) {
            el.title = i18n[state.currentLang][key];
            if(el.getAttribute('aria-label')) el.setAttribute('aria-label', i18n[state.currentLang][key]);
        }
    });
    
    const langBtn = document.getElementById('langBtn');
    if (langBtn) langBtn.textContent = i18n[state.currentLang].langSwitch;

    checkEmptyState(); // Refresh empty state message

    // Update existing rows
    const tableBody = document.getElementById('fundTable').tBodies[0];
    Array.from(tableBody.rows).forEach(row => {
        if (row.classList.contains('loading')) {
            const nameMain = row.querySelector('.name-main');
            const nameSub = row.querySelector('.name-sub');
            if (nameMain) nameMain.textContent = i18n[state.currentLang].loading;
            if (nameSub) nameSub.textContent = i18n[state.currentLang].waiting;
        } else if (row.classList.contains('error-row')) {
            const errorMsg = row.querySelector('.error-message');
            if (errorMsg) errorMsg.textContent = i18n[state.currentLang].fetchError;
        } else if (!row.querySelector('td[colspan="12"]')) {
            const nameSub = row.querySelector('.name-sub');
            if (nameSub) {
                const code = row.id.replace('fund-', '');
                nameSub.textContent = `${i18n[state.currentLang].codePrefix} ${code}`;
            }
        }
        const removeBtn = row.querySelector('.remove-btn');
        if (removeBtn) removeBtn.title = i18n[state.currentLang].removeTitle;
    });
}

function toggleLang() {
    state.currentLang = state.currentLang === 'zh' ? 'en' : 'zh';
    localStorage.setItem('fund-monitor-lang', state.currentLang);
    applyLanguage();
    applyTheme();
    
    // Re-render modal if open
    const modal = document.getElementById('analysisModal');
    const content = document.getElementById('analysisContent');
    if (modal && modal.classList.contains('show') && content && content.innerHTML.trim() !== '') {
        const codeBadge = content.querySelector('.code-badge');
        if (codeBadge) {
            navigateToAnalysis(codeBadge.textContent);
        }
    }
}

// --- Fund Management ---
function updateAddButtonState() {
    const addFundBtn = document.getElementById('addFundBtn');
    const fundCodeInput = document.getElementById('fundCodeInput');
    addFundBtn.disabled = fundCodeInput.value.trim() === '';
}

function addFundCodes(codesFromRestore = null) {
    const fundCodeInput = document.getElementById('fundCodeInput');
    const codes = (codesFromRestore ?? fundCodeInput.value.trim().split(','))
        .map(code => code.trim())
        .filter(code => code !== '');
    
    if (codes.length === 0) return;

    // Add rows individually
    const newCodes = [];
    codes.forEach(code => {
        if (!state.fundCodes.has(code)) {
            state.fundCodes.add(code);
            addRow(code);
            newCodes.push(code);
        }
    });

    // Fetch data in a single batch request
    if (newCodes.length > 0) {
        const batchCodeStr = newCodes.join(',');
        fetchDataForCode(batchCodeStr);
    }

    saveFundCodes(state.fundCodes);
    fundCodeInput.value = '';
    applyLanguage();
    applyTheme();
    updateAddButtonState();
}

function refreshData() {
    const tableBody = document.getElementById('fundTable').tBodies[0];
    tableBody.innerHTML = '';
    const allCodes = Array.from(state.fundCodes);
    
    // Re-add empty rows
    allCodes.forEach(code => addRow(code));
    
    // Fetch all in a single batch request
    if (allCodes.length > 0) {
        const batchCodeStr = allCodes.join(',');
        fetchDataForCode(batchCodeStr);
    }
    updateLastRefreshTime();
}

// --- Expose to Window for HTML Inline Events ---
window.toggleTheme = toggleTheme;
window.toggleLang = toggleLang;
window.addFundCodes = () => addFundCodes();
window.refreshData = refreshData;
window.removeFund = removeFund;
window.sortTable = sortTable;
window.closeModal = closeModal;

// --- Init ---
document.addEventListener('DOMContentLoaded', () => {
    applyTheme();
    applyLanguage();

    const fundCodeInput = document.getElementById('fundCodeInput');
    updateAddButtonState();
    checkEmptyState();
    updateDashboardStats();

    fundCodeInput.addEventListener('input', updateAddButtonState);
    fundCodeInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            addFundCodes();
        }
    });

    initModalListeners();

    const savedCodes = loadSavedFundCodes();
    if (savedCodes.length > 0) {
        // Initialize the state set with the loaded codes before adding
        // actually addFundCodes will handle state.fundCodes.has logic
        addFundCodes(savedCodes);
        updateLastRefreshTime();
    }
});
