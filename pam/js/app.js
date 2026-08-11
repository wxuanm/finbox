import { state } from './config/state.js';
import { i18n, t } from './config/i18n.js';
import { applyTheme, toggleTheme } from './core/theme.js';
import { loadAccounts, loadPreferences, loadSnapshots, saveAccounts, savePreferences, saveSnapshots } from './modules/accountPerformance/storage.js';
import { buildAccountMetrics } from './modules/accountPerformance/metrics.js';
import { renderAccountList, bindAccountList } from './modules/accountPerformance/accountList.js';
import { readSnapshotForm, renderSnapshotForm, resetSnapshotForm, showFormMessage } from './modules/accountPerformance/snapshotForm.js';
import { bindPeriodSwitch, renderPerformanceChart, renderPeriodSwitch, resizeChart } from './modules/accountPerformance/performanceChart.js';
import { bindAccountComparison, renderAccountComparison, renderOverviewCards } from './modules/accountPerformance/metricsPanel.js';
import { bindSnapshotTable, bindSnapshotTableAccountSwitch, renderSnapshotTable } from './modules/accountPerformance/snapshotTable.js';
import { loadHoldings, saveHoldings } from './modules/holdings/storage.js';
import { buildHoldingsMetrics } from './modules/holdings/holdingsMetrics.js';
import { bindHoldingsPanel, renderHoldingsPanel, resetHoldingForm, showHoldingMessage } from './modules/holdings/holdingsPanel.js';
import { fetchQuotes } from './modules/holdings/quoteApi.js';
import { todayKey } from './utils/formatter.js';

let quoteRefreshInProgress = false;
let snapshotGenerationInProgress = false;
let pendingSnapshotGeneration = null;
let pendingConfirmAction = null;

const SNAPSHOT_DATE_REFERENCE_FUNDS = [
    { market: 'Fund', symbol: '110001', name: '易方达平稳增长混合' },
    { market: 'Fund', symbol: '000001', name: '华夏成长混合' },
    { market: 'Fund', symbol: '270002', name: '广发稳健增长混合A' }
];

function applyLanguage() {
    document.documentElement.lang = state.currentLang === 'en' ? 'en' : 'zh-CN';
    const title = document.getElementById('pageTitle');
    if (title) title.textContent = t('title');
    document.title = t('title');
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (key && i18n[state.currentLang]?.[key]) el.innerHTML = t(key);
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        if (key && i18n[state.currentLang]?.[key]) el.placeholder = t(key);
    });
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
        const key = el.getAttribute('data-i18n-title');
        if (!key || !i18n[state.currentLang]?.[key]) return;
        const value = t(key);
        el.title = value;
        if (el.hasAttribute('aria-label')) el.setAttribute('aria-label', value);
    });
    document.querySelectorAll('[data-i18n-aria-label]').forEach(el => {
        const key = el.getAttribute('data-i18n-aria-label');
        if (key && i18n[state.currentLang]?.[key]) el.setAttribute('aria-label', t(key));
    });
    const langLabel = t('langSwitch');
    const langBtn = document.getElementById('langBtn');
    const mobileLangMenuText = document.getElementById('mobileLangMenuText');
    if (langBtn) langBtn.textContent = langLabel;
    if (mobileLangMenuText) mobileLangMenuText.textContent = langLabel;
}

function toggleLang() {
    state.currentLang = state.currentLang === 'zh' ? 'en' : 'zh';
    persistPreferences();
    applyLanguage();
    applyTheme(state.theme);
    renderApp();
}

function init() {
    const preferences = loadPreferences();
    state.accounts = loadAccounts();
    state.snapshots = loadSnapshots();
    state.holdings = loadHoldings();
    state.theme = preferences.theme || 'light';
    state.selectedPeriod = preferences.selectedPeriod || '3M';
    state.activeView = normalizeActiveView(preferences.activeView);
    state.assetDataAction = normalizeAssetDataAction(preferences.assetDataAction);
    state.assetDataMaintenanceOpen = false;
    state.amountsHidden = Boolean(preferences.amountsHidden);
    state.currentLang = normalizeLang(preferences.currentLang);
    state.holdingFilters = preferences.holdingFilters || state.holdingFilters;
    state.holdingSortKey = preferences.holdingSortKey || state.holdingSortKey;
    state.holdingSortOrder = preferences.holdingSortOrder || state.holdingSortOrder;
    state.selectedAccountId = resolveSelectedAccount(preferences.selectedAccountId);

    applyTheme(state.theme);
    applyLanguage();
    bindEvents();
    renderApp();
}

function bindEvents() {
    document.getElementById('themeBtn')?.addEventListener('click', toggleTheme);
    document.getElementById('langBtn')?.addEventListener('click', toggleLang);
    document.getElementById('mobileLangBtn')?.addEventListener('click', toggleLang);
    document.getElementById('demoDataBtn')?.addEventListener('click', handleDemoDataRequest);
    document.getElementById('mobileDemoDataBtn')?.addEventListener('click', handleDemoDataRequest);
    document.getElementById('exportDataBtn')?.addEventListener('click', exportData);
    document.getElementById('mobileExportDataBtn')?.addEventListener('click', exportData);
    document.getElementById('importDataBtn')?.addEventListener('click', openImportDataPicker);
    document.getElementById('mobileImportDataBtn')?.addEventListener('click', openImportDataPicker);
    document.getElementById('amountPrivacyBtn')?.addEventListener('click', toggleAmountPrivacy);
    document.getElementById('mobileMenuBtn')?.addEventListener('click', toggleMobileActionMenu);
    document.getElementById('contextMenuBtn')?.addEventListener('click', toggleContextActionMenu);
    bindAccountFloatingActions();
    document.getElementById('importDataInput')?.addEventListener('change', importData);
    document.addEventListener('click', closeMobileActionMenu);
    document.getElementById('accountForm')?.addEventListener('submit', handleAddAccount);
    document.getElementById('snapshotForm')?.addEventListener('submit', handleSaveSnapshot);
    document.getElementById('addAccountToolbarBtn')?.addEventListener('click', openAccountDialog);
    document.getElementById('addSnapshotBtn')?.addEventListener('click', () => openSnapshotForAccount(state.selectedAccountId));
    document.querySelectorAll('[data-dialog-close]').forEach(button => {
        button.addEventListener('click', () => {
            if (button.dataset.dialogClose === 'account') {
                closeAccountDialog();
                return;
            }
            cancelAssetDialog(button.dataset.dialogClose);
        });
    });
    document.getElementById('accountDialog')?.addEventListener('cancel', event => {
        event.preventDefault();
        closeAccountDialog();
    });
    document.getElementById('snapshotDialog')?.addEventListener('cancel', event => {
        event.preventDefault();
        cancelAssetDialog('snapshot');
    });
    document.getElementById('holdingDialog')?.addEventListener('cancel', event => {
        event.preventDefault();
        cancelAssetDialog('holding');
    });
    document.getElementById('snapshotGenerateDialog')?.addEventListener('cancel', event => {
        event.preventDefault();
        closeSnapshotGenerateDialog();
    });
    document.getElementById('snapshotGenerateForm')?.addEventListener('submit', handleSnapshotGeneratePreview);
    document.getElementById('snapshotGenerateConfirmBtn')?.addEventListener('click', confirmSnapshotGeneration);
    document.getElementById('snapshotGenerateCancelBtn')?.addEventListener('click', closeSnapshotGenerateDialog);
    document.querySelector('[data-snapshot-generate-close]')?.addEventListener('click', closeSnapshotGenerateDialog);
    document.getElementById('confirmDialogConfirmBtn')?.addEventListener('click', runPendingConfirmAction);
    document.querySelectorAll('[data-confirm-cancel]').forEach(button => button.addEventListener('click', closeConfirmDialog));
    document.getElementById('confirmDialog')?.addEventListener('cancel', event => {
        event.preventDefault();
        closeConfirmDialog();
    });
    document.querySelectorAll('[data-context-command]').forEach(button => {
        button.addEventListener('click', () => runContextCommand(button.dataset.contextCommand));
    });
    document.querySelectorAll('.module-tab[data-view]').forEach(tab => {
        tab.addEventListener('click', () => switchView(tab.dataset.view));
    });
    document.getElementById('cancelEditBtn')?.addEventListener('click', () => {
        cancelAssetDialog('snapshot');
    });

    bindAccountList({
        onSelect: selectAccount,
        onRename: renameAccount,
        onDelete: deleteAccount,
        onAdd: openAccountDialog
    });
    bindPeriodSwitch(period => {
        state.selectedPeriod = period;
        persistPreferences();
        renderApp();
    });
    bindAccountComparison({
        onHighlight: accountId => {
            state.selectedHighlightAccountId = state.selectedHighlightAccountId === accountId ? '' : accountId;
            renderApp();
        },
        onSort: sortAccountComparison
    });

    function sortAccountComparison(sortKey) {
        if (state.comparisonSortKey === sortKey) {
            state.comparisonSortOrder *= -1;
        } else {
            state.comparisonSortKey = sortKey;
            state.comparisonSortOrder = sortKey === 'name' || sortKey === 'latestDate' ? 1 : -1;
        }
        renderApp();
    }

    bindSnapshotTable({
        onEdit: editSnapshot,
        onDelete: deleteSnapshot
    });
    bindSnapshotTableAccountSwitch();
    bindHoldingsPanel({
        onFilter: updateHoldingFilter,
        onAdd: () => openHoldingForAccount(state.selectedAccountId),
        onSubmit: saveHolding,
        onCancelEdit: () => {
            cancelAssetDialog('holding');
        },
        onEdit: editHolding,
        onDelete: deleteHolding,
        onSort: sortHoldings,
        onRefreshQuotes: refreshHoldingQuotes,
        onGenerateSnapshots: generateSnapshotsFromHoldings
    });
    window.addEventListener('resize', resizeChart, { passive: true });
    window.addEventListener('resize', keepAccountFloatingActionsInView, { passive: true });
}

function bindAccountFloatingActions() {
    const wrap = document.getElementById('accountFloatingActions');
    const toggle = document.getElementById('accountFloatingToggle');
    if (!wrap || !toggle) return;

    let pointerId = null;
    let startX = 0;
    let startY = 0;
    let startRight = 0;
    let startBottom = 0;
    let dragged = false;

    toggle.addEventListener('pointerdown', event => {
        if (window.matchMedia('(max-width: 720px)').matches) return;
        pointerId = event.pointerId;
        startX = event.clientX;
        startY = event.clientY;
        const rect = wrap.getBoundingClientRect();
        startRight = window.innerWidth - rect.right;
        startBottom = window.innerHeight - rect.bottom;
        dragged = false;
        toggle.setPointerCapture(pointerId);
    });

    toggle.addEventListener('pointermove', event => {
        if (pointerId !== event.pointerId) return;
        const deltaX = event.clientX - startX;
        const deltaY = event.clientY - startY;
        if (Math.abs(deltaX) > 4 || Math.abs(deltaY) > 4) dragged = true;
        if (!dragged) return;
        positionAccountFloatingActions(startRight - deltaX, startBottom - deltaY);
    });

    toggle.addEventListener('pointerup', event => {
        if (pointerId !== event.pointerId) return;
        toggle.releasePointerCapture(pointerId);
        pointerId = null;
    });

    toggle.addEventListener('pointercancel', event => {
        if (pointerId !== event.pointerId) return;
        pointerId = null;
        dragged = false;
    });

    toggle.addEventListener('click', event => {
        event.stopPropagation();
        if (dragged) {
            dragged = false;
            return;
        }
        updateAccountFloatingMenuPlacement();
        const isOpen = wrap.classList.toggle('is-open');
        toggle.setAttribute('aria-expanded', String(isOpen));
        wrap.querySelector('.account-floating-menu')?.setAttribute('aria-hidden', String(!isOpen));
    });

    wrap.querySelector('.account-floating-menu')?.addEventListener('click', () => closeAccountFloatingActions());
    document.addEventListener('click', closeAccountFloatingActions);
}

function positionAccountFloatingActions(right, bottom) {
    const wrap = document.getElementById('accountFloatingActions');
    if (!wrap) return;
    const rect = wrap.getBoundingClientRect();
    const margin = 16;
    const maxRight = Math.max(margin, window.innerWidth - rect.width - margin);
    const maxBottom = Math.max(margin, window.innerHeight - rect.height - margin);
    wrap.style.right = `${Math.min(Math.max(right, margin), maxRight)}px`;
    wrap.style.bottom = `${Math.min(Math.max(bottom, margin), maxBottom)}px`;
    updateAccountFloatingMenuPlacement();
}

function keepAccountFloatingActionsInView() {
    const wrap = document.getElementById('accountFloatingActions');
    if (!wrap || window.matchMedia('(max-width: 720px)').matches) return;
    const rect = wrap.getBoundingClientRect();
    positionAccountFloatingActions(window.innerWidth - rect.right, window.innerHeight - rect.bottom);
}

function updateAccountFloatingMenuPlacement() {
    const wrap = document.getElementById('accountFloatingActions');
    if (!wrap) return;
    const rect = wrap.getBoundingClientRect();
    wrap.classList.toggle('is-menu-below', rect.top < 180);
    wrap.classList.toggle('is-menu-left', rect.left < 160);
}

function closeAccountFloatingActions() {
    const wrap = document.getElementById('accountFloatingActions');
    if (!wrap) return;
    wrap.classList.remove('is-open');
    document.getElementById('accountFloatingToggle')?.setAttribute('aria-expanded', 'false');
    wrap.querySelector('.account-floating-menu')?.setAttribute('aria-hidden', 'true');
}

function openImportDataPicker() {
    document.getElementById('importDataInput')?.click();
}

function toggleMobileActionMenu(event) {
    event.stopPropagation();
    const menu = document.querySelector('.mobile-more-actions');
    const button = document.getElementById('mobileMenuBtn');
    const isOpen = menu?.classList.toggle('menu-open') || false;
    button?.setAttribute('aria-expanded', String(isOpen));
}

function toggleContextActionMenu(event) {
    event.stopPropagation();
    const menu = document.querySelector('.mobile-context-actions');
    const button = document.getElementById('contextMenuBtn');
    const isOpen = menu?.classList.toggle('menu-open') || false;
    button?.setAttribute('aria-expanded', String(isOpen));
}

function closeMobileActionMenu() {
    document.querySelector('.mobile-more-actions')?.classList.remove('menu-open');
    document.getElementById('mobileMenuBtn')?.setAttribute('aria-expanded', 'false');
    document.querySelector('.mobile-context-actions')?.classList.remove('menu-open');
    document.getElementById('contextMenuBtn')?.setAttribute('aria-expanded', 'false');
}

function renderApp() {
    applyLanguage();
    state.selectedAccountId = resolveSelectedAccount(state.selectedAccountId);
    syncSelectedHoldingFilter();
    const metrics = buildAccountMetrics(state.accounts, state.snapshots, state.selectedPeriod);
    const holdingsMetrics = buildHoldingsMetrics(state.holdings, state.accounts, state.holdingFilters);
    renderActiveView();
    renderAmountPrivacyToggle();
    renderOverviewCards(metrics);
    renderAccountList(metrics);
    renderSnapshotForm();
    renderPeriodSwitch();
    renderPerformanceChart(metrics);
    renderAccountComparison(metrics);
    renderSnapshotTable();
    renderHoldingsPanel(holdingsMetrics);
}

function toggleAmountPrivacy() {
    state.amountsHidden = !state.amountsHidden;
    persistPreferences();
    renderApp();
}

function renderAmountPrivacyToggle() {
    const label = state.amountsHidden ? t('showAmounts') : t('hideAmounts');
    ['amountPrivacyBtn'].forEach(id => {
        const button = document.getElementById(id);
        if (!button) return;
        if (id === 'amountPrivacyBtn') button.innerHTML = amountPrivacyIcon(state.amountsHidden);
        else button.innerHTML = `${amountPrivacyIcon(state.amountsHidden).replaceAll('width="19" height="19"', 'width="16" height="16"')}<span>${label}</span>`;
        button.setAttribute('aria-pressed', String(state.amountsHidden));
        button.setAttribute('aria-label', label);
        button.title = label;
    });
}

function amountPrivacyIcon(isHidden) {
    return isHidden
        ? '<svg width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.9" viewBox="0 0 24 24" aria-hidden="true"><path d="M3.8 4.2 20.2 20.6" stroke-linecap="round"/><path d="M10.5 10.9a2.7 2.7 0 0 0 3.6 3.6" stroke-linecap="round"/><path d="M9.3 6.5a9.8 9.8 0 0 1 2.7-.3c5.6 0 9 5.8 9 5.8a15 15 0 0 1-2.8 3.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M6.4 7.7C4.2 9.3 3 12 3 12s3.4 5.8 9 5.8c1.5 0 2.8-.4 4-.9" stroke-linecap="round" stroke-linejoin="round"/></svg>'
        : '<svg width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.9" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12s3.4-5.8 9-5.8 9 5.8 9 5.8-3.4 5.8-9 5.8S3 12 3 12Z" stroke-linejoin="round"/><path d="M12 14.7a2.7 2.7 0 1 0 0-5.4 2.7 2.7 0 0 0 0 5.4Z"/></svg>';
}

function switchView(view) {
    state.activeView = normalizeActiveView(view);
    persistPreferences();
    renderApp();
    requestAnimationFrame(resizeChart);
}

function openSnapshotForAccount(accountId) {
    if (!state.accounts.some(account => account.id === accountId)) return;
    state.selectedAccountId = accountId;
    state.activeView = 'assetData';
    state.assetDataAction = 'snapshot';
    state.assetDataMaintenanceOpen = true;
    resetSnapshotForm();
    persistPreferences();
    renderApp();
    openAssetDialog('snapshot');
}

function openHoldingForAccount(accountId) {
    if (!state.accounts.some(account => account.id === accountId)) return;
    state.selectedAccountId = accountId;
    state.activeView = 'assetData';
    state.assetDataAction = 'holding';
    state.assetDataMaintenanceOpen = true;
    resetHoldingForm();
    persistPreferences();
    renderApp();
    openAssetDialog('holding');
}

function openAssetDialog(action) {
    if (state.accounts.length === 0) {
        openAccountDialog();
        return;
    }

    const dialog = document.getElementById(action === 'holding' ? 'holdingDialog' : 'snapshotDialog');
    if (!dialog) return;
    if (!dialog.open && typeof dialog.showModal === 'function') {
        dialog.showModal();
    } else if (!dialog.open) {
        dialog.setAttribute('open', '');
    }
    requestAnimationFrame(() => {
        const selector = action === 'holding' ? '#holdingNameInput' : '#snapshotValueInput';
        document.querySelector(selector)?.focus();
    });
}

function closeAssetDialog(action) {
    const dialog = document.getElementById(action === 'holding' ? 'holdingDialog' : 'snapshotDialog');
    if (!dialog?.open) return;
    if (typeof dialog.close === 'function') {
        dialog.close();
    } else {
        dialog.removeAttribute('open');
    }
}

function cancelAssetDialog(action) {
    const isHolding = action === 'holding';
    const wasEditing = isHolding ? Boolean(state.editingHoldingId) : Boolean(state.editingSnapshotId);
    if (isHolding) {
        resetHoldingForm();
        showHoldingMessage(wasEditing ? t('editingCancelled') : '');
    } else {
        resetSnapshotForm();
        showFormMessage(wasEditing ? t('editingCancelled') : '');
    }
    state.assetDataMaintenanceOpen = false;
    closeAssetDialog(action);
    persistPreferences();
    renderApp();
}

function openAccountDialog() {
    closeMobileActionMenu();
    const dialog = document.getElementById('accountDialog');
    if (!dialog) return;
    if (!dialog.open && typeof dialog.showModal === 'function') {
        dialog.showModal();
    } else if (!dialog.open) {
        dialog.setAttribute('open', '');
    }
    requestAnimationFrame(() => document.getElementById('accountNameInput')?.focus());
}

function closeAccountDialog() {
    const dialog = document.getElementById('accountDialog');
    if (!dialog?.open) return;
    if (typeof dialog.close === 'function') {
        dialog.close();
    } else {
        dialog.removeAttribute('open');
    }
}

function renderActiveView() {
    document.querySelectorAll('.module-tab[data-view]').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.view === state.activeView);
    });
    document.querySelectorAll('[data-context-actions]').forEach(actions => {
        actions.classList.toggle('active', actions.dataset.contextActions === state.activeView);
    });
    if (state.activeView !== 'assetData') closeAccountFloatingActions();
    document.querySelectorAll('[data-workspace-view]').forEach(view => {
        view.classList.toggle('active', view.dataset.workspaceView === state.activeView);
    });
}

function runContextCommand(command) {
    closeMobileActionMenu();
    if (command === 'add-account') {
        openAccountDialog();
        return;
    }
    if (command === 'add-holding') {
        openHoldingForAccount(state.selectedAccountId);
        return;
    }
    if (command === 'add-snapshot') {
        openSnapshotForAccount(state.selectedAccountId);
        return;
    }
    if (command === 'generate-snapshot') {
        generateSnapshotsFromHoldings();
        return;
    }
    if (command === 'refresh-quotes') {
        refreshHoldingQuotes();
        return;
    }
}

function handleAddAccount(event) {
    event.preventDefault();
    const input = document.getElementById('accountNameInput');
    const name = input.value.trim();
    if (!name) {
        showFormMessage(t('accountNameRequired'), true);
        return;
    }

    const now = new Date().toISOString();
    const account = {
        id: createId('account'),
        name,
        currency: 'CNY',
        createdAt: now,
        updatedAt: now
    };
    state.accounts.push(account);
    state.selectedAccountId = account.id;
    state.activeView = 'assetData';
    state.assetDataAction = 'snapshot';
    state.assetDataMaintenanceOpen = false;
    input.value = '';
    closeAccountDialog();
    persistAll();
    renderApp();
}

function selectAccount(accountId) {
    if (!state.accounts.some(account => account.id === accountId)) return;
    state.selectedAccountId = accountId;
    state.activeView = 'assetData';
    persistPreferences();
    renderApp();
}

function renameAccount(accountId) {
    const account = state.accounts.find(item => item.id === accountId);
    if (!account) return;
    const nextName = prompt(t('promptNewAccountName'), account.name)?.trim();
    if (!nextName) return;
    account.name = nextName;
    account.updatedAt = new Date().toISOString();
    persistAll();
    showFormMessage(t('accountNameUpdated'));
    renderApp();
}

function deleteAccount(accountId) {
    const account = state.accounts.find(item => item.id === accountId);
    if (!account) return;
    const count = state.snapshots.filter(snapshot => snapshot.accountId === accountId).length;
    const holdingCount = state.holdings.filter(holding => holding.accountId === accountId).length;
    showConfirmDialog({
        eyebrow: 'Delete Account',
        title: t('deleteAccountTitle'),
        description: t('deleteAccountDesc'),
        message: t('deleteAccountMessage', { name: account.name }),
        detail: t('deleteAccountDetail', { snapshots: count, holdings: holdingCount }),
        confirmLabel: t('deleteAccount'),
        onConfirm: () => deleteAccountNow(accountId)
    });
}

function deleteAccountNow(accountId) {
    state.accounts = state.accounts.filter(item => item.id !== accountId);
    state.snapshots = state.snapshots.filter(snapshot => snapshot.accountId !== accountId);
    state.holdings = state.holdings.filter(holding => holding.accountId !== accountId);
    if (state.selectedAccountId === accountId) state.selectedAccountId = state.accounts[0]?.id || '';
    if (state.selectedHighlightAccountId === accountId) state.selectedHighlightAccountId = '';
    persistAll();
    showFormMessage(t('accountDeleted'));
    renderApp();
}

function handleSaveSnapshot(event) {
    event.preventDefault();
    const payload = readSnapshotForm();
    const validationError = validateSnapshot(payload);
    if (validationError) {
        showFormMessage(validationError, true);
        return;
    }

    const existing = state.snapshots.find(snapshot => {
        return snapshot.accountId === payload.accountId && snapshot.date === payload.date && snapshot.id !== state.editingSnapshotId;
    });
    if (existing) {
        showConfirmDialog({
            eyebrow: 'Overwrite Snapshot',
            title: t('overwriteSnapshotTitle'),
            description: t('overwriteSnapshotDesc'),
            message: t('overwriteSnapshotMessage'),
            detail: t('overwriteSnapshotDetail'),
            confirmLabel: t('overwriteSnapshotConfirm'),
            onConfirm: () => saveSnapshotPayload(payload, existing)
        });
        return;
    }

    saveSnapshotPayload(payload, existing);
}

function saveSnapshotPayload(payload, existing) {
    if (state.editingSnapshotId) {
        state.snapshots = state.snapshots.map(snapshot => {
            if (snapshot.id !== state.editingSnapshotId) return snapshot;
            return { ...snapshot, ...payload };
        });
        if (existing) state.snapshots = state.snapshots.filter(snapshot => snapshot.id !== existing.id);
        showFormMessage(t('snapshotUpdated'));
    } else if (existing) {
        Object.assign(existing, payload);
        showFormMessage(t('sameDaySnapshotOverwritten'));
    } else {
        state.snapshots.push({ id: createId('snapshot'), ...payload });
        showFormMessage(t('snapshotSaved'));
    }

    state.selectedAccountId = payload.accountId;
    state.activeView = 'assetData';
    state.assetDataAction = 'snapshot';
    state.assetDataMaintenanceOpen = false;
    resetSnapshotForm();
    closeAssetDialog('snapshot');
    persistAll();
    renderApp();
}

function editSnapshot(snapshotId) {
    const snapshot = state.snapshots.find(item => item.id === snapshotId);
    if (!snapshot) return;
    state.editingSnapshotId = snapshotId;
    state.selectedAccountId = snapshot.accountId;
    state.activeView = 'assetData';
    state.assetDataAction = 'snapshot';
    state.assetDataMaintenanceOpen = true;
    renderApp();
    openAssetDialog('snapshot');
}

function deleteSnapshot(snapshotId) {
    const snapshot = state.snapshots.find(item => item.id === snapshotId);
    if (!snapshot) return;
    showConfirmDialog({
        eyebrow: 'Delete Snapshot',
        title: t('deleteSnapshotTitle'),
        description: t('deleteSnapshotDesc'),
        message: t('deleteSnapshotMessage', { date: snapshot.date }),
        detail: '',
        confirmLabel: t('deleteSnapshotConfirm'),
        onConfirm: () => deleteSnapshotNow(snapshotId)
    });
}

function deleteSnapshotNow(snapshotId) {
    state.snapshots = state.snapshots.filter(item => item.id !== snapshotId);
    if (state.editingSnapshotId === snapshotId) state.editingSnapshotId = '';
    persistAll();
    showFormMessage(t('snapshotDeleted'));
    renderApp();
}

function handleDemoDataRequest() {
    closeMobileActionMenu();
    if (state.accounts.length > 0 || state.snapshots.length > 0) {
        showConfirmDialog({
            eyebrow: 'Demo Data',
            title: t('addDemoDataTitle'),
            description: t('addDemoDataDesc'),
            message: t('addDemoDataMessage'),
            detail: t('addDemoDataDetail'),
            confirmLabel: t('addDemoDataConfirm'),
            onConfirm: addDemoData
        });
        return;
    }
    addDemoData();
}

function addDemoData() {
    const now = new Date().toISOString();
    const demoAccounts = [
        { id: createId('account'), name: t('demoSteadyAccount'), currency: 'CNY', createdAt: now, updatedAt: now },
        { id: createId('account'), name: t('demoGrowthAccount'), currency: 'CNY', createdAt: now, updatedAt: now },
        { id: createId('account'), name: t('demoHkAccount'), currency: 'CNY', createdAt: now, updatedAt: now },
        { id: createId('account'), name: t('demoUsAccount'), currency: 'CNY', createdAt: now, updatedAt: now },
        { id: createId('account'), name: t('demoPensionAccount'), currency: 'CNY', createdAt: now, updatedAt: now },
        { id: createId('account'), name: t('demoTacticalAccount'), currency: 'CNY', createdAt: now, updatedAt: now }
    ];
    const [steady, growth, hk, us, pension, tactical] = demoAccounts;
    const demoSnapshots = buildDemoSnapshots([
        [steady.id, 100000, 0.006, 0.012, { 6: 10000, 12: 5000 }],
        [growth.id, 80000, 0.011, 0.035, { 5: 20000, 13: 20000 }],
        [hk.id, 60000, 0.004, 0.028, { 8: 5000 }],
        [us.id, 120000, 0.009, 0.022, { 10: 10000 }],
        [pension.id, 50000, 0.005, 0.009, { 2: 2000, 5: 2000, 8: 2000, 11: 2000, 14: 2000, 17: 2000 }],
        [tactical.id, 70000, 0.007, 0.05, { 7: -8000, 14: 10000 }]
    ]);
    const demoHoldings = [
        [steady.id, '510300', t('demoCsi300Etf'), 'fund', 'Fund', 18000, 4.25, 4.42],
        [steady.id, '019547', t('demoShortBondFund'), 'fund', 'Fund', 30000, 1.03, 1.05],
        [steady.id, '', t('demoAccountCash'), 'cash', 'Cash', 1, 15000, 15000],
        [growth.id, '600519', t('demoMoutai'), 'stock', 'CN', 30, 1550, 1680],
        [growth.id, '300750', t('demoCatl'), 'stock', 'CN', 200, 185, 205],
        [growth.id, '159919', t('demoCsi300Etf'), 'fund', 'Fund', 8000, 3.85, 4.12],
        [hk.id, '', t('demoHkCash'), 'cash', 'Cash', 1, 18000, 18000],
        [hk.id, '', t('demoHkTechFund'), 'other', 'Other', 1, 42000, 45100],
        [us.id, '', t('demoUsCash'), 'cash', 'Cash', 1, 28000, 28000],
        [us.id, '', t('demoUsIndexFund'), 'other', 'Other', 1, 102000, 116000],
        [pension.id, '017512', t('demoPensionFund'), 'fund', 'Fund', 42000, 1.08, 1.12],
        [tactical.id, '159915', t('demoChiNextEtf'), 'fund', 'Fund', 25000, 1.85, 1.76],
        [tactical.id, '', t('demoTacticalCash'), 'cash', 'Cash', 1, 18000, 18000]
    ].map(([accountId, symbol, name, assetClass, market, quantity, costPrice, currentPrice]) => ({
        id: createId('holding'),
        accountId,
        symbol,
        name,
        assetClass,
        market,
        quantity,
        costPrice,
        currentPrice,
        currency: 'CNY',
        priceSource: 'manual',
        priceUpdatedAt: now,
        asOfDate: demoSnapshotDate(0),
        note: ''
    }));

    state.accounts.push(...demoAccounts);
    state.snapshots.push(...demoSnapshots);
    state.holdings.push(...demoHoldings);
    state.selectedAccountId = steady.id;
    state.selectedPeriod = '3M';
    state.activeView = 'assetData';
    state.assetDataAction = 'snapshot';
    persistAll();
    showFormMessage(t('demoDataAdded'));
    renderApp();
}

function buildDemoSnapshots(configs) {
    return configs.flatMap(([accountId, initialValue, monthlyReturn, volatility, flows]) => {
        let totalValue = initialValue;
        return Array.from({ length: 19 }, (_, index) => {
            const netFlow = flows[index] || 0;
            const returnRate = monthlyReturn + demoMonthlyVariation(index, volatility);
            if (index > 0) totalValue = Math.round(totalValue * (1 + returnRate) + netFlow);
            return {
                id: createId('snapshot'),
                accountId,
                date: demoSnapshotDate(18 - index),
                totalValue,
                netFlow,
                note: index === 0 ? t('initialRecord') : (netFlow > 0 ? t('additionalCapital') : (netFlow < 0 ? t('withdrawCapital') : ''))
            };
        });
    });
}

function demoMonthlyVariation(index, volatility) {
    const pattern = [0.45, -0.8, 0.3, 0.9, -0.4, 0.15, -0.65, 0.55, -0.2, 0.75, -0.5, 0.1];
    return pattern[index % pattern.length] * volatility;
}

function demoSnapshotDate(monthsAgo) {
    const date = new Date();
    date.setDate(1);
    date.setMonth(date.getMonth() - monthsAgo);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}-01`;
}

function exportData() {
    const payload = {
        app: 'pam',
        schemaVersion: 1,
        exportedAt: new Date().toISOString(),
        data: {
            accounts: state.accounts,
            snapshots: state.snapshots,
            holdings: state.holdings,
            preferences: {
                theme: state.theme,
                selectedAccountId: state.selectedAccountId,
                selectedPeriod: state.selectedPeriod,
                activeView: state.activeView,
                assetDataAction: state.assetDataAction,
                assetDataMaintenanceOpen: state.assetDataMaintenanceOpen,
                amountsHidden: state.amountsHidden,
                holdingFilters: state.holdingFilters,
                holdingSortKey: state.holdingSortKey,
                holdingSortOrder: state.holdingSortOrder,
                currentLang: state.currentLang
            }
        }
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `pam-backup-${todayKey()}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}

function importData(event) {
    const input = event.target;
    const file = input.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
        try {
            const parsed = JSON.parse(String(reader.result || ''));
            const data = parseImportPayload(parsed);
            if (!data) {
                alert(t('importInvalid'));
                return;
            }

            const hasCurrentData = state.accounts.length > 0 || state.snapshots.length > 0 || state.holdings.length > 0;
            const message = hasCurrentData
                ? t('importReplaceMessage')
                : t('importConfirmMessage');
            showConfirmDialog({
                eyebrow: 'Import Data',
                title: t('importBackupTitle'),
                description: hasCurrentData ? t('importReplaceDesc') : t('importBackupDesc'),
                message,
                detail: t('importBackupDetail', { accounts: data.accounts.length, snapshots: data.snapshots.length, holdings: data.holdings.length }),
                confirmLabel: t('importConfirm'),
                onConfirm: () => applyImportedData(data)
            });
        } catch (error) {
            alert(t('importParseFailed'));
        } finally {
            input.value = '';
        }
    };
    reader.onerror = () => {
        alert(t('importReadFailed'));
        input.value = '';
    };
    reader.readAsText(file, 'utf-8');
}

function applyImportedData(data) {
    state.accounts = data.accounts;
    state.snapshots = data.snapshots;
    state.holdings = data.holdings;
    state.theme = data.preferences.theme || state.theme;
    state.selectedPeriod = data.preferences.selectedPeriod || '3M';
    state.activeView = normalizeActiveView(data.preferences.activeView);
    state.assetDataAction = normalizeAssetDataAction(data.preferences.assetDataAction || (data.preferences.activeView === 'holdings' ? 'holding' : 'snapshot'));
    state.assetDataMaintenanceOpen = Boolean(data.preferences.assetDataMaintenanceOpen);
    state.amountsHidden = Boolean(data.preferences.amountsHidden);
    state.currentLang = normalizeLang(data.preferences.currentLang || state.currentLang);
    state.holdingFilters = data.preferences.holdingFilters || { accountId: 'all', assetClass: 'all', market: 'all' };
    state.holdingSortKey = data.preferences.holdingSortKey || 'marketValue';
    state.holdingSortOrder = Number(data.preferences.holdingSortOrder) || -1;
    state.selectedAccountId = resolveSelectedAccount(data.preferences.selectedAccountId);
    state.selectedHighlightAccountId = '';
    state.editingSnapshotId = '';
    state.editingHoldingId = '';
    applyTheme(state.theme);
    persistAll();
    renderApp();
    alert(t('importDone', { accounts: state.accounts.length, snapshots: state.snapshots.length, holdings: state.holdings.length }));
}

function parseImportPayload(payload) {
    if (!payload || payload.app !== 'pam' || payload.schemaVersion !== 1 || !payload.data) return null;
    const accounts = Array.isArray(payload.data.accounts) ? payload.data.accounts.map(normalizeImportedAccount).filter(Boolean) : [];
    const accountIds = new Set(accounts.map(account => account.id));
    const snapshots = Array.isArray(payload.data.snapshots)
        ? payload.data.snapshots.map(normalizeImportedSnapshot).filter(snapshot => snapshot && accountIds.has(snapshot.accountId))
        : [];
    const holdings = Array.isArray(payload.data.holdings)
        ? payload.data.holdings.map(normalizeImportedHolding).filter(holding => holding && accountIds.has(holding.accountId))
        : [];
    const preferences = payload.data.preferences && typeof payload.data.preferences === 'object' ? payload.data.preferences : {};
    return { accounts, snapshots, holdings, preferences };
}

function normalizeImportedAccount(account) {
    if (!account || typeof account !== 'object') return null;
    const id = String(account.id || '').trim();
    const name = String(account.name || '').trim();
    if (!id || !name) return null;
    return {
        id,
        name,
        currency: 'CNY',
        createdAt: account.createdAt || new Date().toISOString(),
        updatedAt: account.updatedAt || account.createdAt || new Date().toISOString()
    };
}

function normalizeImportedSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') return null;
    const id = String(snapshot.id || '').trim();
    const accountId = String(snapshot.accountId || '').trim();
    const date = String(snapshot.date || '').trim();
    const totalValue = Number(snapshot.totalValue);
    const netFlow = Number(snapshot.netFlow);
    if (!id || !accountId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
    if (!Number.isFinite(totalValue) || totalValue < 0 || !Number.isFinite(netFlow)) return null;
    return {
        id,
        accountId,
        date,
        totalValue,
        netFlow,
        note: String(snapshot.note || '').trim()
    };
}

function normalizeImportedHolding(holding) {
    if (!holding || typeof holding !== 'object') return null;
    const id = String(holding.id || '').trim();
    const accountId = String(holding.accountId || '').trim();
    const name = String(holding.name || '').trim();
    const quantity = Number(holding.quantity);
    const costPrice = Number(holding.costPrice);
    const currentPrice = Number(holding.currentPrice);
    if (!id || !accountId || !name) return null;
    if (![quantity, costPrice, currentPrice].every(Number.isFinite) || quantity < 0 || costPrice < 0 || currentPrice < 0) return null;
    return {
        id,
        accountId,
        symbol: String(holding.symbol || '').trim(),
        name,
        assetClass: ['stock', 'fund', 'bond', 'cash', 'other'].includes(holding.assetClass) ? holding.assetClass : 'other',
        market: ['CN', 'Fund', 'Cash', 'Other'].includes(holding.market) ? holding.market : 'Other',
        quantity,
        costPrice,
        currentPrice,
        currency: 'CNY',
        priceSource: holding.priceSource === 'quote' ? 'quote' : 'manual',
        priceUpdatedAt: holding.priceUpdatedAt || '',
        asOfDate: holding.asOfDate || todayKey(),
        note: String(holding.note || '').trim()
    };
}

function updateHoldingFilter(key, value) {
    state.holdingFilters = { ...state.holdingFilters, [key]: value };
    if (key === 'accountId' && value !== 'all') state.selectedAccountId = value;
    persistPreferences();
    renderApp();
}

function saveHolding(payload) {
    const validationError = validateHolding(payload);
    if (validationError) {
        showHoldingMessage(validationError, true);
        return;
    }

    const now = new Date().toISOString();
    if (state.editingHoldingId) {
        state.holdings = state.holdings.map(holding => holding.id === state.editingHoldingId
            ? { ...holding, ...payload, currency: 'CNY', priceSource: holding.priceSource || 'manual', priceUpdatedAt: holding.priceUpdatedAt || now }
            : holding);
        showHoldingMessage(t('holdingUpdated'));
    } else {
        state.holdings.push({
            id: createId('holding'),
            ...payload,
            currency: 'CNY',
            priceSource: 'manual',
            priceUpdatedAt: now
        });
        showHoldingMessage(t('holdingSaved'));
    }

    state.selectedAccountId = payload.accountId;
    state.assetDataAction = 'holding';
    state.assetDataMaintenanceOpen = false;
    resetHoldingForm();
    closeAssetDialog('holding');
    persistAll();
    renderApp();
}

function editHolding(holdingId) {
    const holding = state.holdings.find(item => item.id === holdingId);
    if (!holding) return;
    state.editingHoldingId = holdingId;
    state.selectedAccountId = holding.accountId;
    state.activeView = 'assetData';
    state.assetDataAction = 'holding';
    state.assetDataMaintenanceOpen = true;
    renderApp();
    openAssetDialog('holding');
}

function deleteHolding(holdingId) {
    const holding = state.holdings.find(item => item.id === holdingId);
    if (!holding) return;
    const accountName = state.accounts.find(account => account.id === holding.accountId)?.name || t('currentAccount');
    const identifier = holding.symbol ? `（${holding.symbol}）` : '';
    showConfirmDialog({
        eyebrow: 'Delete Holding',
        title: t('deleteHoldingTitle'),
        description: t('holdingBelongsTo', { account: accountName }),
        message: t('deleteHoldingMessage', { name: holding.name, identifier }),
        detail: t('deleteHoldingDetail'),
        confirmLabel: t('deleteHoldingConfirm'),
        onConfirm: () => deleteHoldingNow(holdingId)
    });
}

function deleteHoldingNow(holdingId) {
    state.holdings = state.holdings.filter(item => item.id !== holdingId);
    if (state.editingHoldingId === holdingId) state.editingHoldingId = '';
    persistAll();
    showHoldingMessage(t('holdingDeleted'));
    renderApp();
}

function sortHoldings(sortKey) {
    if (state.holdingSortKey === sortKey) {
        state.holdingSortOrder *= -1;
    } else {
        state.holdingSortKey = sortKey;
        state.holdingSortOrder = ['name', 'accountName', 'assetClass', 'priceUpdatedAt'].includes(sortKey) ? 1 : -1;
    }
    renderApp();
}

async function refreshHoldingQuotes() {
    if (quoteRefreshInProgress) return;
    state.assetDataAction = 'holding';
    const supported = state.holdings.filter(holding => ['CN', 'Fund'].includes(holding.market) && holding.symbol);
    if (supported.length === 0) {
        showHoldingMessage(t('noRefreshableHoldings'), true);
        return;
    }

    try {
        quoteRefreshInProgress = true;
        setQuoteRefreshState(true);
        showHoldingMessage(t('refreshingQuotes', { count: supported.length }));
        const data = await fetchQuotes(supported);
        const quoteMap = new Map((data.quotes || []).map(quote => [`${quote.market}:${quote.symbol}`, quote]));
        let updatedCount = 0;
        state.holdings = state.holdings.map(holding => {
            const quote = quoteMap.get(`${holding.market}:${holding.symbol}`);
            if (!quote || !Number.isFinite(Number(quote.price))) return holding;
            updatedCount += 1;
            return {
                ...holding,
                name: quote.name || holding.name,
                currentPrice: Number(quote.price),
                priceSource: 'quote',
                priceUpdatedAt: quote.quoteTime || data.updatedAt || new Date().toISOString(),
                asOfDate: todayKey()
            };
        });
        persistAll();
        renderApp();
        showHoldingMessage(t('quotesRefreshed', { updated: updatedCount, failed: (data.failedItems || []).length }), (data.failedItems || []).length > 0);
    } catch (error) {
        showHoldingMessage(t('quotesRefreshFailed'), true);
    } finally {
        quoteRefreshInProgress = false;
        setQuoteRefreshState(false);
    }
}

function setQuoteRefreshState(isRefreshing) {
    const buttons = [
        document.getElementById('refreshQuotesBtn'),
        document.querySelector('[data-context-command="refresh-quotes"]')
    ];
    buttons.forEach(button => {
        if (!button) return;
        button.disabled = isRefreshing;
        button.classList.toggle('is-loading', isRefreshing);
        button.setAttribute('aria-busy', String(isRefreshing));
    });
}

function setSnapshotGenerationState(isGenerating) {
    const buttons = [
        document.getElementById('generateSnapshotsBtn'),
        document.querySelector('[data-context-command="generate-snapshot"]')
    ];
    buttons.forEach(button => {
        if (!button) return;
        button.disabled = isGenerating;
        button.classList.toggle('is-loading', isGenerating);
        button.setAttribute('aria-busy', String(isGenerating));
    });
}

function validateHolding(payload) {
    if (!payload.accountId) return t('holdingAccountRequired');
    if (!payload.name) return t('holdingNameRequired');
    if (![payload.quantity, payload.costPrice, payload.currentPrice].every(Number.isFinite)) return t('holdingNumbersRequired');
    if (payload.quantity < 0 || payload.costPrice < 0 || payload.currentPrice < 0) return t('holdingNumbersPositive');
    return '';
}

function validateSnapshot(payload) {
    if (!payload.accountId) return t('snapshotAccountRequired');
    if (!payload.date) return t('dateRequired');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(payload.date)) return t('invalidDate');
    if (!Number.isFinite(payload.totalValue) || payload.totalValue <= 0) return t('totalValuePositive');
    if (!Number.isFinite(payload.netFlow)) return t('netFlowNumber');
    return '';
}

async function generateSnapshotsFromHoldings() {
    if (snapshotGenerationInProgress) return;
    state.assetDataAction = 'snapshot';
    openSnapshotGenerateDialog();
}

function openSnapshotGenerateDialog() {
    closeMobileActionMenu();
    const dialog = document.getElementById('snapshotGenerateDialog');
    const form = document.getElementById('snapshotGenerateForm');
    if (!dialog || !form) return;
    pendingSnapshotGeneration = null;
    form.reset();
    const defaultOption = form.querySelector('input[name="snapshotDateOption"][value="1"]');
    if (defaultOption) defaultOption.checked = true;
    renderSnapshotGeneratePreview();
    showSnapshotGenerateMessage(t('snapshotGenerateInitial'));
    setSnapshotGenerateConfirmVisible(false);
    if (!dialog.open && typeof dialog.showModal === 'function') {
        dialog.showModal();
    } else if (!dialog.open) {
        dialog.setAttribute('open', '');
    }
}

function closeSnapshotGenerateDialog() {
    const dialog = document.getElementById('snapshotGenerateDialog');
    pendingSnapshotGeneration = null;
    setSnapshotGenerateConfirmVisible(false);
    if (!dialog?.open) return;
    if (typeof dialog.close === 'function') {
        dialog.close();
    } else {
        dialog.removeAttribute('open');
    }
}

async function handleSnapshotGeneratePreview(event) {
    event.preventDefault();
    if (snapshotGenerationInProgress) return;

    try {
        snapshotGenerationInProgress = true;
        setSnapshotGenerationState(true);
        pendingSnapshotGeneration = null;
        setSnapshotGenerateConfirmVisible(false);

        const normalizedOption = getSelectedSnapshotDateOption();

        showHoldingMessage(t('calculatingSnapshot'));
        showSnapshotGenerateMessage(t('fetchingSnapshotPreview'));
        let valuation;
        try {
            valuation = await buildSnapshotValuation(normalizedOption);
        } catch (error) {
            const message = error.message || t('snapshotValuationFailed');
            showHoldingMessage(message, true);
            showFormMessage(message, true);
            showSnapshotGenerateMessage(message, true);
            return;
        }
        const accountIds = state.accounts.map(account => account.id);
        const rows = accountIds
            .map(accountId => {
                const account = state.accounts.find(item => item.id === accountId);
                const totalValue = getAccountHoldingMarketValue(accountId, valuation.priceByHoldingId);
                return { account, accountId, totalValue };
            })
            .filter(row => row.account && row.totalValue > 0);

        if (rows.length === 0) {
            showHoldingMessage(t('noSnapshotMarketValue'), true);
            showFormMessage(t('noSnapshotMarketValue'), true);
            showSnapshotGenerateMessage(t('noSnapshotMarketValue'), true);
            return;
        }

        const date = valuation.date;
        const dateLabel = normalizedOption === '1' ? t('previousTradingDay') : t('today');
        const existingCount = rows.filter(row => state.snapshots.some(snapshot => snapshot.accountId === row.accountId && snapshot.date === date)).length;

        pendingSnapshotGeneration = { date, dateLabel, rows, valuation, existingCount };
        renderSnapshotGeneratePreview(pendingSnapshotGeneration);
        showSnapshotGenerateMessage(t('snapshotPreviewGenerated'));
        setSnapshotGenerateConfirmVisible(true);
    } finally {
        snapshotGenerationInProgress = false;
        setSnapshotGenerationState(false);
    }
}

function confirmSnapshotGeneration() {
    if (!pendingSnapshotGeneration || snapshotGenerationInProgress) return;
    const { date, rows } = pendingSnapshotGeneration;

    rows.forEach(row => {
        const snapshot = {
            id: createId('snapshot'),
            accountId: row.accountId,
            date,
            totalValue: Number(row.totalValue.toFixed(2)),
            netFlow: 0,
            note: t('generatedByHoldings'),
            source: 'holdings'
        };
        const existing = state.snapshots.find(item => item.accountId === row.accountId && item.date === date);
        if (existing) {
            Object.assign(existing, { ...snapshot, id: existing.id });
        } else {
            state.snapshots.push(snapshot);
        }
    });

    state.selectedAccountId = rows[0].accountId;
    state.activeView = 'assetData';
    state.assetDataAction = 'snapshot';
    persistAll();
    renderApp();
    closeSnapshotGenerateDialog();
    showFormMessage(t('generatedSnapshots', { count: rows.length }));
    showHoldingMessage(t('generatedSnapshots', { count: rows.length }));
}

function getSelectedSnapshotDateOption() {
    return document.querySelector('input[name="snapshotDateOption"]:checked')?.value || '1';
}

function setSnapshotGenerateConfirmVisible(isVisible) {
    document.getElementById('snapshotGenerateConfirmBtn')?.classList.toggle('hidden', !isVisible);
    const calculateBtn = document.getElementById('snapshotGenerateCalculateBtn');
    if (calculateBtn) calculateBtn.textContent = isVisible ? t('recalculate') : t('calculateSnapshot');
}

function showSnapshotGenerateMessage(message, isError = false) {
    const el = document.getElementById('snapshotGenerateMessage');
    if (!el) return;
    el.textContent = message || '';
    el.classList.toggle('error', Boolean(isError));
}

function renderSnapshotGeneratePreview(generation = null) {
    const wrap = document.getElementById('snapshotGeneratePreview');
    if (!wrap) return;
    if (!generation) {
        wrap.innerHTML = `<div class="preview-empty">${t('snapshotPreviewEmpty')}</div>`;
        return;
    }

    const { date, dateLabel, rows, valuation, existingCount } = generation;
    const totalValue = rows.reduce((sum, row) => sum + row.totalValue, 0);
    const warnings = [];
    if (existingCount > 0) warnings.push(t('sameDayOverwriteWarning', { count: existingCount }));
    if (valuation.fallbackCount > 0) warnings.push(t('manualPriceWarning', { count: valuation.fallbackCount }));
    if (valuation.failedCount > 0) warnings.push(t('quoteFailedWarning', { count: valuation.failedCount }));
    if (valuation.dateFallback) warnings.push(t('dateFallbackWarning'));
    wrap.innerHTML = `
        <div class="snapshot-preview-hero">
            <div><span>${t('snapshotDateLabel')}</span><strong>${date}</strong><small>${dateLabel} · ${valuation.description}</small></div>
            <div><span>${t('accountScope')}</span><strong>${t('accountsCount', { count: rows.length })}</strong><small>${t('netFlowDefaultsZero')}</small></div>
            <div><span>${t('totalMarketValue')}</span><strong>${formatPreviewCurrency(totalValue)}</strong><small>${t('basedOnHoldingQuantity')}</small></div>
        </div>
        <div class="snapshot-preview-warning${warnings.length === 0 ? ' ready' : ''}">
            ${warnings.length === 0 ? t('valuationReady') : warnings.join('; ')}
        </div>
        <div class="snapshot-preview-accounts">
            ${rows.map(row => `<div><span>${escapePreviewText(row.account.name)}</span><strong>${formatPreviewCurrency(row.totalValue)}</strong></div>`).join('')}
        </div>
    `;
}

function formatPreviewCurrency(value) {
    if (state.amountsHidden) return '****';
    const num = Number(value);
    if (!Number.isFinite(num)) return '-';
    return num.toLocaleString(state.currentLang === 'en' ? 'en-US' : 'zh-CN', { style: 'currency', currency: 'CNY', maximumFractionDigits: 2 });
}

function escapePreviewText(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

async function buildSnapshotValuation(dateOption) {
    const priceByHoldingId = new Map();
    const supported = state.holdings.filter(holding => ['CN', 'Fund'].includes(holding.market) && holding.symbol);
    const quoteByKey = new Map();
    const referenceFundQuoteByKey = new Map();
    let failedCount = 0;
    let dateReferenceFailed = false;

    if (supported.length > 0) {
        try {
            const data = await fetchQuotes(supported);
            (data.quotes || []).forEach(quote => quoteByKey.set(`${quote.market}:${quote.symbol}`, quote));
            failedCount = (data.failedItems || []).length;
        } catch (error) {
            failedCount = supported.length;
            if (dateOption === '1') {
                throw new Error(t('previousDayQuotesFailed'));
            }
            showHoldingMessage(t('snapshotQuoteFallback'), true);
        }
    }

    if (dateOption === '1') {
        try {
            const data = await fetchQuotes(SNAPSHOT_DATE_REFERENCE_FUNDS);
            (data.quotes || []).forEach(quote => referenceFundQuoteByKey.set(`${quote.market}:${quote.symbol}`, quote));
        } catch (error) {
            referenceFundQuoteByKey.clear();
            dateReferenceFailed = true;
        }
    }

    const dateResult = resolveSnapshotDate(dateOption, referenceFundQuoteByKey);
    let fallbackCount = 0;
    state.holdings.forEach(holding => {
        const quote = quoteByKey.get(`${holding.market}:${holding.symbol}`);
        const valuationPrice = resolveSnapshotPrice(holding, quote, dateOption);
        if (valuationPrice.price === null) return;
        priceByHoldingId.set(holding.id, valuationPrice.price);
        if (valuationPrice.isFallback) fallbackCount += 1;
    });

    return {
        date: dateResult.date,
        dateSource: dateResult.source,
        dateFallback: dateResult.isFallback,
        dateReferenceFailed,
        priceByHoldingId,
        fallbackCount,
        failedCount,
        description: dateOption === '1' ? t('previousDayValuationDesc') : t('todayValuationDesc')
    };
}

function resolveSnapshotDate(dateOption, quoteByKey) {
    if (dateOption !== '1') return { date: todayKey(), source: 'today', isFallback: false };

    const referenceFundNavDates = SNAPSHOT_DATE_REFERENCE_FUNDS
        .map(fund => quoteByKey.get(`${fund.market}:${fund.symbol}`)?.navDate)
        .filter(Boolean)
        .sort();

    const referenceDate = referenceFundNavDates[referenceFundNavDates.length - 1];
    if (referenceDate) return { date: referenceDate, source: 'reference-fund-nav-date', isFallback: false };

    return { date: previousTradingDayKey(), source: 'local-previous-trading-day', isFallback: true };
}

function resolveSnapshotPrice(holding, quote, dateOption) {
    if (holding.market === 'CN') {
        const quotePrice = dateOption === '1' ? Number(quote?.previousClose) : Number(quote?.latestPrice ?? quote?.previousClose);
        if (Number.isFinite(quotePrice) && quotePrice > 0) return { price: quotePrice, isFallback: false };
        return { price: manualHoldingPrice(holding), isFallback: true };
    }

    if (holding.market === 'Fund') {
        const unitNav = Number(quote?.snapshotUnitNav);
        if (Number.isFinite(unitNav) && unitNav > 0) return { price: unitNav, isFallback: false };
        return { price: manualHoldingPrice(holding), isFallback: true };
    }

    return { price: manualHoldingPrice(holding), isFallback: true };
}

function manualHoldingPrice(holding) {
    const price = Number(holding.currentPrice);
    return Number.isFinite(price) ? price : null;
}

function previousTradingDayKey() {
    const date = new Date();
    date.setDate(date.getDate() - 1);
    while ([0, 6].includes(date.getDay())) {
        date.setDate(date.getDate() - 1);
    }
    return formatDateKey(date);
}

function formatDateKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function getAccountHoldingMarketValue(accountId, priceByHoldingId = new Map()) {
    return state.holdings
        .filter(holding => holding.accountId === accountId)
        .reduce((sum, holding) => {
            const quantity = Number(holding.quantity);
            const currentPrice = Number(priceByHoldingId.get(holding.id) ?? holding.currentPrice);
            if (!Number.isFinite(quantity) || !Number.isFinite(currentPrice)) return sum;
            return sum + quantity * currentPrice;
        }, 0);
}

function resolveSelectedAccount(accountId) {
    if (state.accounts.some(account => account.id === accountId)) return accountId;
    return state.accounts[0]?.id || '';
}

function syncSelectedHoldingFilter() {
    const selected = resolveSelectedAccount(state.selectedAccountId);
    if (!selected) return;
    state.holdingFilters = { ...state.holdingFilters, accountId: selected };
}

function showConfirmDialog({ eyebrow = 'Confirm', title = t('confirmTitle'), description = t('confirmDesc'), message = t('confirmMessage'), detail = '', confirmLabel = t('confirm'), onConfirm }) {
    const dialog = document.getElementById('confirmDialog');
    if (!dialog || typeof onConfirm !== 'function') return;

    document.getElementById('confirmDialogEyebrow').textContent = eyebrow;
    document.getElementById('confirmDialogTitle').textContent = title;
    document.getElementById('confirmDialogDescription').textContent = description;
    document.getElementById('confirmDialogMessage').textContent = message;
    const detailEl = document.getElementById('confirmDialogDetail');
    detailEl.textContent = detail;
    detailEl.classList.toggle('hidden', !detail);
    const confirmBtn = document.getElementById('confirmDialogConfirmBtn');
    confirmBtn.textContent = confirmLabel;
    pendingConfirmAction = onConfirm;

    if (!dialog.open && typeof dialog.showModal === 'function') {
        dialog.showModal();
    } else if (!dialog.open) {
        dialog.setAttribute('open', '');
    }
    requestAnimationFrame(() => confirmBtn.focus());
}

function closeConfirmDialog() {
    pendingConfirmAction = null;
    const dialog = document.getElementById('confirmDialog');
    if (!dialog?.open) return;
    if (typeof dialog.close === 'function') {
        dialog.close();
    } else {
        dialog.removeAttribute('open');
    }
}

function runPendingConfirmAction() {
    const action = pendingConfirmAction;
    closeConfirmDialog();
    if (typeof action === 'function') action();
}

function normalizeActiveView(view) {
    if (view === 'data' || view === 'holdings' || view === 'assetData') return 'assetData';
    return 'analysis';
}

function normalizeAssetDataAction(action) {
    return action === 'holding' ? 'holding' : 'snapshot';
}

function normalizeLang(lang) {
    return lang === 'en' ? 'en' : 'zh';
}

function persistAll() {
    saveAccounts(state.accounts);
    saveSnapshots(state.snapshots);
    saveHoldings(state.holdings);
    persistPreferences();
}

function persistPreferences() {
    savePreferences({
        theme: state.theme,
        selectedAccountId: state.selectedAccountId,
        selectedPeriod: state.selectedPeriod,
        activeView: state.activeView,
        assetDataAction: state.assetDataAction,
        assetDataMaintenanceOpen: state.assetDataMaintenanceOpen,
        amountsHidden: state.amountsHidden,
        holdingFilters: state.holdingFilters,
        holdingSortKey: state.holdingSortKey,
        holdingSortOrder: state.holdingSortOrder,
        currentLang: state.currentLang
    });
}

function createId(prefix) {
    if (globalThis.crypto?.randomUUID) return `${prefix}-${globalThis.crypto.randomUUID()}`;
    return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

document.addEventListener('DOMContentLoaded', init);
