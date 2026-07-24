import { state } from './config/state.js';
import { i18n } from './config/i18n.js';
import { applyTheme, toggleTheme } from './core/theme.js';
import { loadSavedFundCodes, saveFundCodes, loadSavedGroups, loadSavedFundGroups } from './utils/storage.js';
import { checkEmptyState, addRow, removeFund, sortTable, toggleGroup, updateGroupCounts, getOrCreateGroupBody, showInlineAdd } from './ui/fundTable.js';
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
    updateGroupCounts(); // Refresh item count translations in group headers

    // Update existing rows
    const fundRows = document.querySelectorAll('#fundTable tr[id^="fund-"]');
    Array.from(fundRows).forEach(row => {
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

// --- Group Management ---
window.promptAddGroup = function() {
    const groupName = prompt(i18n[state.currentLang].promptNewGroup);
    if (groupName && groupName.trim() !== '') {
        const cleanedName = groupName.trim();
        if (!state.groups.includes(cleanedName) && cleanedName !== 'default') {
            state.groups.push(cleanedName);
            saveFundCodes();
            refreshData(); // Redraws to show empty group
        }
    }
}

window.promptRenameGroup = function(oldId) {
    if (oldId === 'default') return;
    const newId = prompt(i18n[state.currentLang].promptNewGroup, oldId);
    if (newId && newId.trim() !== '' && newId.trim() !== oldId) {
        const cleaned = newId.trim();
        if (state.groups.includes(cleaned)) {
            alert("Name already exists.");
            return;
        }
        
        // Replace in groups array
        const idx = state.groups.indexOf(oldId);
        if (idx !== -1) state.groups[idx] = cleaned;
        
        // Replace in fundGroups mapping
        for (const [code, grp] of Object.entries(state.fundGroups)) {
            if (grp === oldId) state.fundGroups[code] = cleaned;
        }
        
        // Replace expand state
        if (state.groupExpanded[oldId] !== undefined) {
            state.groupExpanded[cleaned] = state.groupExpanded[oldId];
            delete state.groupExpanded[oldId];
        }
        
        saveFundCodes();
        refreshData();
    }
}

window.deleteGroup = function(groupId) {
    if (groupId === 'default') return;
    
    if (confirm(i18n[state.currentLang].confirmDeleteGroup)) {
        const codesToDelete = [];
        for (const [code, grp] of Object.entries(state.fundGroups)) {
            if (grp === groupId) {
                codesToDelete.push(code);
            }
        }
        
        codesToDelete.forEach(code => {
            state.fundCodes.delete(code);
            delete state.fundGroups[code];
            const row = document.getElementById(`fund-${code}`);
            if (row) row.remove();
        });
        
        const table = document.getElementById('fundTable');
        const tbody = table.querySelector(`tbody[data-group="${groupId}"]`);
        if (tbody) tbody.remove();
        
        state.groups = state.groups.filter(g => g !== groupId);
        
        saveFundCodes();
        checkEmptyState();
        updateDashboardStats();
    }
};

// --- Fund Management ---
window.addFundCodes = function(targetGroupId, codesStr) {
    const codes = codesStr.split(',').map(c => c.trim()).filter(c => c !== '');
    if (codes.length === 0) return;

    const newCodes = [];
    codes.forEach(code => {
        if (!state.fundCodes.has(code)) {
            state.fundCodes.add(code);
            state.fundGroups[code] = targetGroupId;
            addRow(code);
            newCodes.push(code);
        } else if (state.fundGroups[code] !== targetGroupId) {
            state.fundGroups[code] = targetGroupId;
            const row = document.getElementById(`fund-${code}`);
            if (row) {
                const targetTbody = getOrCreateGroupBody(targetGroupId);
                targetTbody.appendChild(row);
                updateGroupCounts();
            }
        }
    });

    if (newCodes.length > 0) {
        fetchDataForCode(newCodes.join(','));
    }

    saveFundCodes();
    applyLanguage();
    applyTheme();
}

function initRestore(savedCodes) {
    const newCodes = [];
    savedCodes.forEach(code => {
        state.fundCodes.add(code);
        if (!state.fundGroups[code]) {
            state.fundGroups[code] = 'default';
        }
        addRow(code);
        newCodes.push(code);
    });

    if (newCodes.length > 0) {
        fetchDataForCode(newCodes.join(','));
    }
}

function refreshData() {
    const table = document.getElementById('fundTable');
    table.querySelectorAll('tbody').forEach(el => el.remove());
    
    // Ensure all groups exist
    state.groups.forEach(g => getOrCreateGroupBody(g));
    
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
window.refreshData = refreshData;
window.removeFund = removeFund;
window.sortTable = sortTable;
window.toggleGroup = toggleGroup;
window.showInlineAdd = showInlineAdd;
window.closeModal = closeModal;
window.promptAddGroup = promptAddGroup;

// --- Init ---
document.addEventListener('DOMContentLoaded', () => {
    applyTheme();
    applyLanguage();

    checkEmptyState();
    updateDashboardStats();

    initModalListeners();

    state.groups = loadSavedGroups();
    state.fundGroups = loadSavedFundGroups();
    const savedCodes = loadSavedFundCodes();
    
    // Ensure all groups exist visually on load
    state.groups.forEach(g => getOrCreateGroupBody(g));
    
    if (savedCodes.length > 0) {
        initRestore(savedCodes);
        updateLastRefreshTime();
    }
});
