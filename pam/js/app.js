import { state } from './config/state.js';
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
    state.holdingFilters = preferences.holdingFilters || state.holdingFilters;
    state.holdingSortKey = preferences.holdingSortKey || state.holdingSortKey;
    state.holdingSortOrder = preferences.holdingSortOrder || state.holdingSortOrder;
    state.selectedAccountId = resolveSelectedAccount(preferences.selectedAccountId);

    applyTheme(state.theme);
    bindEvents();
    renderApp();
}

function bindEvents() {
    document.getElementById('themeBtn')?.addEventListener('click', toggleTheme);
    document.getElementById('mobileThemeBtn')?.addEventListener('click', toggleTheme);
    document.getElementById('demoDataBtn')?.addEventListener('click', addDemoData);
    document.getElementById('mobileDemoDataBtn')?.addEventListener('click', addDemoData);
    document.getElementById('exportDataBtn')?.addEventListener('click', exportData);
    document.getElementById('mobileExportDataBtn')?.addEventListener('click', exportData);
    document.getElementById('importDataBtn')?.addEventListener('click', openImportDataPicker);
    document.getElementById('mobileImportDataBtn')?.addEventListener('click', openImportDataPicker);
    document.getElementById('mobileMenuBtn')?.addEventListener('click', toggleMobileActionMenu);
    document.getElementById('contextMenuBtn')?.addEventListener('click', toggleContextActionMenu);
    document.getElementById('importDataInput')?.addEventListener('change', importData);
    document.addEventListener('click', closeMobileActionMenu);
    document.getElementById('accountForm')?.addEventListener('submit', handleAddAccount);
    document.getElementById('snapshotForm')?.addEventListener('submit', handleSaveSnapshot);
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
    state.selectedAccountId = resolveSelectedAccount(state.selectedAccountId);
    syncSelectedHoldingFilter();
    const metrics = buildAccountMetrics(state.accounts, state.snapshots, state.selectedPeriod);
    const holdingsMetrics = buildHoldingsMetrics(state.holdings, state.accounts, state.holdingFilters);
    renderActiveView();
    renderOverviewCards(metrics);
    renderAccountList(metrics);
    renderSnapshotForm();
    renderPeriodSwitch();
    renderPerformanceChart(metrics);
    renderAccountComparison(metrics);
    renderSnapshotTable();
    renderHoldingsPanel(holdingsMetrics);
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
        showHoldingMessage(wasEditing ? '已取消编辑。' : '');
    } else {
        resetSnapshotForm();
        showFormMessage(wasEditing ? '已取消编辑。' : '');
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
    document.querySelectorAll('[data-workspace-view]').forEach(view => {
        view.classList.toggle('active', view.dataset.workspaceView === state.activeView);
    });
}

function runContextCommand(command) {
    closeMobileActionMenu();
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
        showFormMessage('账户名称不能为空。', true);
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
    const nextName = prompt('请输入新的账户名称', account.name)?.trim();
    if (!nextName) return;
    account.name = nextName;
    account.updatedAt = new Date().toISOString();
    persistAll();
    showFormMessage('账户名称已更新。');
    renderApp();
}

function deleteAccount(accountId) {
    const account = state.accounts.find(item => item.id === accountId);
    if (!account) return;
    const count = state.snapshots.filter(snapshot => snapshot.accountId === accountId).length;
    const holdingCount = state.holdings.filter(holding => holding.accountId === accountId).length;
    if (!confirm(`确认删除账户「${account.name}」及其 ${count} 条快照、${holdingCount} 条持仓吗？此操作不可恢复。`)) return;

    state.accounts = state.accounts.filter(item => item.id !== accountId);
    state.snapshots = state.snapshots.filter(snapshot => snapshot.accountId !== accountId);
    state.holdings = state.holdings.filter(holding => holding.accountId !== accountId);
    if (state.selectedAccountId === accountId) state.selectedAccountId = state.accounts[0]?.id || '';
    if (state.selectedHighlightAccountId === accountId) state.selectedHighlightAccountId = '';
    persistAll();
    showFormMessage('账户已删除。');
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
    if (existing && !confirm('该账户在同一天已有快照，是否覆盖原记录？')) return;

    if (state.editingSnapshotId) {
        state.snapshots = state.snapshots.map(snapshot => {
            if (snapshot.id !== state.editingSnapshotId) return snapshot;
            return { ...snapshot, ...payload };
        });
        if (existing) state.snapshots = state.snapshots.filter(snapshot => snapshot.id !== existing.id);
        showFormMessage('快照已更新。');
    } else if (existing) {
        Object.assign(existing, payload);
        showFormMessage('同日快照已覆盖。');
    } else {
        state.snapshots.push({ id: createId('snapshot'), ...payload });
        showFormMessage('快照已保存。');
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
    if (!confirm(`确认删除 ${snapshot.date} 的快照吗？`)) return;
    state.snapshots = state.snapshots.filter(item => item.id !== snapshotId);
    if (state.editingSnapshotId === snapshotId) state.editingSnapshotId = '';
    persistAll();
    showFormMessage('快照已删除。');
    renderApp();
}

function addDemoData() {
    if ((state.accounts.length > 0 || state.snapshots.length > 0) && !confirm('当前已有数据，确认添加独立示例账户吗？')) return;
    const now = new Date().toISOString();
    const demoAccounts = [
        { id: createId('account'), name: '示例 稳健账户', currency: 'CNY', createdAt: now, updatedAt: now },
        { id: createId('account'), name: '示例 成长账户', currency: 'CNY', createdAt: now, updatedAt: now },
        { id: createId('account'), name: '示例 港股账户', currency: 'CNY', createdAt: now, updatedAt: now },
        { id: createId('account'), name: '示例 美股账户', currency: 'CNY', createdAt: now, updatedAt: now },
        { id: createId('account'), name: '示例 养老账户', currency: 'CNY', createdAt: now, updatedAt: now },
        { id: createId('account'), name: '示例 实验策略', currency: 'CNY', createdAt: now, updatedAt: now }
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
        [steady.id, '510300', '沪深300ETF', 'fund', 'Fund', 18000, 4.25, 4.42],
        [steady.id, '019547', '中短债基金', 'fund', 'Fund', 30000, 1.03, 1.05],
        [steady.id, '', '账户现金', 'cash', 'Cash', 1, 15000, 15000],
        [growth.id, '600519', '贵州茅台', 'stock', 'CN', 30, 1550, 1680],
        [growth.id, '300750', '宁德时代', 'stock', 'CN', 200, 185, 205],
        [growth.id, '159919', '沪深300ETF', 'fund', 'Fund', 8000, 3.85, 4.12],
        [hk.id, '', '港股账户现金', 'cash', 'Cash', 1, 18000, 18000],
        [hk.id, '', '港股科技基金', 'other', 'Other', 1, 42000, 45100],
        [us.id, '', '美股账户现金', 'cash', 'Cash', 1, 28000, 28000],
        [us.id, '', '美股指数基金', 'other', 'Other', 1, 102000, 116000],
        [pension.id, '017512', '养老目标基金', 'fund', 'Fund', 42000, 1.08, 1.12],
        [tactical.id, '159915', '创业板ETF', 'fund', 'Fund', 25000, 1.85, 1.76],
        [tactical.id, '', '策略备用金', 'cash', 'Cash', 1, 18000, 18000]
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
    showFormMessage('示例数据已添加，可在账户管理中查看。');
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
                note: index === 0 ? '初始记录' : (netFlow > 0 ? '追加资金' : (netFlow < 0 ? '取出资金' : ''))
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
                holdingFilters: state.holdingFilters,
                holdingSortKey: state.holdingSortKey,
                holdingSortOrder: state.holdingSortOrder
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
                alert('导入失败：文件不是有效的 PAM 备份。');
                return;
            }

            const hasCurrentData = state.accounts.length > 0 || state.snapshots.length > 0 || state.holdings.length > 0;
            const message = hasCurrentData
                ? '导入会替换当前浏览器中的 PAM 账户和快照，确认继续吗？'
                : '确认导入 PAM 备份数据吗？';
            if (!confirm(message)) return;

            state.accounts = data.accounts;
            state.snapshots = data.snapshots;
            state.holdings = data.holdings;
            state.theme = data.preferences.theme || state.theme;
            state.selectedPeriod = data.preferences.selectedPeriod || '3M';
            state.activeView = normalizeActiveView(data.preferences.activeView);
            state.assetDataAction = normalizeAssetDataAction(data.preferences.assetDataAction || (data.preferences.activeView === 'holdings' ? 'holding' : 'snapshot'));
            state.assetDataMaintenanceOpen = Boolean(data.preferences.assetDataMaintenanceOpen);
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
            alert(`导入完成：${state.accounts.length} 个账户，${state.snapshots.length} 条快照，${state.holdings.length} 条持仓。`);
        } catch (error) {
            alert('导入失败：无法解析 JSON 文件。');
        } finally {
            input.value = '';
        }
    };
    reader.onerror = () => {
        alert('导入失败：无法读取文件。');
        input.value = '';
    };
    reader.readAsText(file, 'utf-8');
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
        showHoldingMessage('持仓已更新。');
    } else {
        state.holdings.push({
            id: createId('holding'),
            ...payload,
            currency: 'CNY',
            priceSource: 'manual',
            priceUpdatedAt: now
        });
        showHoldingMessage('持仓已保存。');
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
    const accountName = state.accounts.find(account => account.id === holding.accountId)?.name || '当前账户';
    const identifier = holding.symbol ? `（${holding.symbol}）` : '';
    if (!confirm(`确认删除持仓「${holding.name}${identifier}」吗？\n所属账户：${accountName}\n此操作不会影响已保存的账户快照。`)) return;
    state.holdings = state.holdings.filter(item => item.id !== holdingId);
    if (state.editingHoldingId === holdingId) state.editingHoldingId = '';
    persistAll();
    showHoldingMessage('持仓已删除。');
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
        showHoldingMessage('没有可刷新行情的 A股或基金持仓。', true);
        return;
    }

    try {
        quoteRefreshInProgress = true;
        setQuoteRefreshState(true);
        showHoldingMessage(`正在刷新 ${supported.length} 项可支持行情，现金和其他市场将保留手动估值。`);
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
        showHoldingMessage(`行情已刷新：${updatedCount} 条成功，${(data.failedItems || []).length} 条失败。`, (data.failedItems || []).length > 0);
    } catch (error) {
        showHoldingMessage('行情刷新失败，请稍后重试或手动维护当前价。', true);
    } finally {
        quoteRefreshInProgress = false;
        setQuoteRefreshState(false);
    }
}

function setQuoteRefreshState(isRefreshing) {
    ['refreshQuotesBtn'].forEach(id => {
        const button = document.getElementById(id);
        if (!button) return;
        button.disabled = isRefreshing;
        button.classList.toggle('is-loading', isRefreshing);
        button.setAttribute('aria-busy', String(isRefreshing));
    });
}

function validateHolding(payload) {
    if (!payload.accountId) return '请选择账户。';
    if (!payload.name) return '持仓名称不能为空。';
    if (![payload.quantity, payload.costPrice, payload.currentPrice].every(Number.isFinite)) return '数量、成本价、当前价必须是数字。';
    if (payload.quantity < 0 || payload.costPrice < 0 || payload.currentPrice < 0) return '数量、成本价、当前价不能为负数。';
    return '';
}

function validateSnapshot(payload) {
    if (!payload.accountId) return '请先选择账户。';
    if (!payload.date) return '日期不能为空。';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(payload.date)) return '日期格式无效。';
    if (!Number.isFinite(payload.totalValue) || payload.totalValue <= 0) return '总资产必须大于 0，请按券商账户总资产手动录入。';
    if (!Number.isFinite(payload.netFlow)) return '净流入必须是数字。';
    return '';
}

function generateSnapshotsFromHoldings() {
    state.assetDataAction = 'snapshot';
    const accountIds = state.accounts.map(account => account.id);
    const rows = accountIds
        .map(accountId => {
            const account = state.accounts.find(item => item.id === accountId);
            const totalValue = getAccountHoldingMarketValue(accountId);
            return { account, accountId, totalValue };
        })
        .filter(row => row.account && row.totalValue > 0);

    if (rows.length === 0) {
        showHoldingMessage('没有可生成快照的持仓市值。请先录入持仓。', true);
        showFormMessage('没有可生成快照的持仓市值。请先录入持仓。', true);
        return;
    }

    const date = todayKey();
    const existingCount = rows.filter(row => state.snapshots.some(snapshot => snapshot.accountId === row.accountId && snapshot.date === date)).length;
    const scopeText = `${rows.length} 个账户`;
    const overwriteText = existingCount > 0 ? `，其中 ${existingCount} 条会覆盖今日已有快照` : '';
    if (!confirm(`将用当前持仓市值为${scopeText}生成今日账户快照，净流入默认为 0${overwriteText}。是否继续？`)) return;

    rows.forEach(row => {
        const snapshot = {
            id: createId('snapshot'),
            accountId: row.accountId,
            date,
            totalValue: Number(row.totalValue.toFixed(2)),
            netFlow: 0,
            note: '由账户管理生成',
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
    showFormMessage(`已生成 ${rows.length} 条账户快照。`);
    showHoldingMessage(`已生成 ${rows.length} 条账户快照。`);
}

function getAccountHoldingMarketValue(accountId) {
    return state.holdings
        .filter(holding => holding.accountId === accountId)
        .reduce((sum, holding) => {
            const quantity = Number(holding.quantity);
            const currentPrice = Number(holding.currentPrice);
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

function normalizeActiveView(view) {
    if (view === 'data' || view === 'holdings' || view === 'assetData') return 'assetData';
    return 'analysis';
}

function normalizeAssetDataAction(action) {
    return action === 'holding' ? 'holding' : 'snapshot';
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
        holdingFilters: state.holdingFilters,
        holdingSortKey: state.holdingSortKey,
        holdingSortOrder: state.holdingSortOrder
    });
}

function createId(prefix) {
    if (globalThis.crypto?.randomUUID) return `${prefix}-${globalThis.crypto.randomUUID()}`;
    return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

document.addEventListener('DOMContentLoaded', init);
