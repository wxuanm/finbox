import { state } from './config/state.js';
import { applyTheme, toggleTheme } from './core/theme.js';
import { loadAccounts, loadPreferences, loadSnapshots, saveAccounts, savePreferences, saveSnapshots } from './modules/accountPerformance/storage.js';
import { buildAccountMetrics } from './modules/accountPerformance/metrics.js';
import { renderAccountList, bindAccountList } from './modules/accountPerformance/accountList.js';
import { readSnapshotForm, renderSnapshotForm, resetSnapshotForm, showFormMessage } from './modules/accountPerformance/snapshotForm.js';
import { bindPeriodSwitch, renderPerformanceChart, renderPeriodSwitch, resizeChart } from './modules/accountPerformance/performanceChart.js';
import { bindMetricCards, renderMetricCards, renderOverviewCards } from './modules/accountPerformance/metricsPanel.js';
import { bindSnapshotTable, bindSnapshotTableAccountSwitch, renderSnapshotTable } from './modules/accountPerformance/snapshotTable.js';
import { todayKey } from './utils/formatter.js';

function init() {
    const preferences = loadPreferences();
    state.accounts = loadAccounts();
    state.snapshots = loadSnapshots();
    state.theme = preferences.theme || 'light';
    state.selectedPeriod = preferences.selectedPeriod || 'ALL';
    state.activeView = preferences.activeView || 'analysis';
    state.selectedAccountId = resolveSelectedAccount(preferences.selectedAccountId);

    applyTheme(state.theme);
    bindEvents();
    renderApp();
}

function bindEvents() {
    document.getElementById('themeBtn')?.addEventListener('click', toggleTheme);
    document.getElementById('demoDataBtn')?.addEventListener('click', addDemoData);
    document.getElementById('accountForm')?.addEventListener('submit', handleAddAccount);
    document.getElementById('snapshotForm')?.addEventListener('submit', handleSaveSnapshot);
    document.querySelectorAll('.module-tab[data-view]').forEach(tab => {
        tab.addEventListener('click', () => switchView(tab.dataset.view));
    });
    document.getElementById('cancelEditBtn')?.addEventListener('click', () => {
        resetSnapshotForm();
        showFormMessage('已取消编辑。');
        renderApp();
    });

    bindAccountList({
        onSelect: selectAccount,
        onRename: renameAccount,
        onDelete: deleteAccount
    });
    bindPeriodSwitch(period => {
        state.selectedPeriod = period;
        persistPreferences();
        renderApp();
    });
    bindMetricCards(accountId => {
        state.selectedHighlightAccountId = state.selectedHighlightAccountId === accountId ? '' : accountId;
        renderApp();
    });
    bindSnapshotTable({
        onEdit: editSnapshot,
        onDelete: deleteSnapshot
    });
    bindSnapshotTableAccountSwitch(selectAccount);
    window.addEventListener('resize', resizeChart, { passive: true });
}

function renderApp() {
    state.selectedAccountId = resolveSelectedAccount(state.selectedAccountId);
    const metrics = buildAccountMetrics(state.accounts, state.snapshots, state.selectedPeriod);
    renderActiveView();
    renderOverviewCards(metrics);
    renderAccountList(metrics);
    renderSnapshotForm();
    renderPeriodSwitch();
    renderPerformanceChart(metrics);
    renderMetricCards(metrics);
    renderSnapshotTable();
}

function switchView(view) {
    state.activeView = view === 'data' ? 'data' : 'analysis';
    persistPreferences();
    renderApp();
    requestAnimationFrame(resizeChart);
}

function renderActiveView() {
    document.querySelectorAll('.module-tab[data-view]').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.view === state.activeView);
    });
    document.querySelectorAll('[data-workspace-view]').forEach(view => {
        view.classList.toggle('active', view.dataset.workspaceView === state.activeView);
    });
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
    state.activeView = 'data';
    input.value = '';
    persistAll();
    showFormMessage(`已新增账户：${name}`);
    renderApp();
}

function selectAccount(accountId) {
    if (!state.accounts.some(account => account.id === accountId)) return;
    state.selectedAccountId = accountId;
    state.activeView = 'data';
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
    if (!confirm(`确认删除账户「${account.name}」及其 ${count} 条快照吗？此操作不可恢复。`)) return;

    state.accounts = state.accounts.filter(item => item.id !== accountId);
    state.snapshots = state.snapshots.filter(snapshot => snapshot.accountId !== accountId);
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
    state.activeView = 'analysis';
    resetSnapshotForm();
    persistAll();
    renderApp();
}

function editSnapshot(snapshotId) {
    const snapshot = state.snapshots.find(item => item.id === snapshotId);
    if (!snapshot) return;
    state.editingSnapshotId = snapshotId;
    state.selectedAccountId = snapshot.accountId;
    state.activeView = 'data';
    renderApp();
    document.getElementById('snapshotDateInput')?.focus();
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
    const demoSnapshots = [
        [steady.id, '2026-01-02', 100000, 0, '初始记录'],
        [steady.id, '2026-02-02', 102400, 0, ''],
        [steady.id, '2026-03-02', 113100, 10000, '追加资金'],
        [steady.id, '2026-04-02', 112300, 0, ''],
        [steady.id, '2026-05-02', 116800, 0, ''],
        [steady.id, '2026-06-02', 119200, 0, ''],
        [growth.id, '2026-01-02', 80000, 0, '初始记录'],
        [growth.id, '2026-02-02', 86000, 0, ''],
        [growth.id, '2026-03-02', 82000, 0, ''],
        [growth.id, '2026-04-02', 127000, 40000, '追加资金'],
        [growth.id, '2026-05-02', 134500, 0, ''],
        [growth.id, '2026-06-02', 142800, 0, ''],
        [hk.id, '2026-01-02', 60000, 0, '初始记录'],
        [hk.id, '2026-02-02', 57300, 0, ''],
        [hk.id, '2026-03-02', 59000, 0, ''],
        [hk.id, '2026-04-02', 65000, 5000, '追加资金'],
        [hk.id, '2026-05-02', 63300, 0, ''],
        [hk.id, '2026-06-02', 67000, 0, ''],
        [us.id, '2026-01-02', 120000, 0, '初始记录'],
        [us.id, '2026-02-02', 126500, 0, ''],
        [us.id, '2026-03-02', 131800, 0, ''],
        [us.id, '2026-04-02', 128200, 0, ''],
        [us.id, '2026-05-02', 136400, 0, ''],
        [us.id, '2026-06-02', 148200, 0, ''],
        [pension.id, '2026-01-02', 50000, 0, '初始记录'],
        [pension.id, '2026-02-02', 53000, 2000, '定投'],
        [pension.id, '2026-03-02', 56000, 2000, '定投'],
        [pension.id, '2026-04-02', 59200, 2000, '定投'],
        [pension.id, '2026-05-02', 62500, 2000, '定投'],
        [pension.id, '2026-06-02', 65800, 2000, '定投'],
        [tactical.id, '2026-01-02', 70000, 0, '初始记录'],
        [tactical.id, '2026-02-02', 76000, 0, ''],
        [tactical.id, '2026-03-02', 69000, 0, ''],
        [tactical.id, '2026-04-02', 73500, -8000, '取出资金'],
        [tactical.id, '2026-05-02', 81000, 0, ''],
        [tactical.id, '2026-06-02', 77000, 0, '']
    ].map(([accountId, date, totalValue, netFlow, note]) => ({
        id: createId('snapshot'),
        accountId,
        date,
        totalValue,
        netFlow,
        note
    }));

    state.accounts.push(...demoAccounts);
    state.snapshots.push(...demoSnapshots);
    state.selectedAccountId = steady.id;
    state.selectedPeriod = 'ALL';
    state.activeView = 'analysis';
    persistAll();
    showFormMessage('示例数据已添加，可在账户列表中查看。');
    renderApp();
}

function validateSnapshot(payload) {
    if (!payload.accountId) return '请先选择账户。';
    if (!payload.date) return '日期不能为空。';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(payload.date)) return '日期格式无效。';
    if (!Number.isFinite(payload.totalValue)) return '总资产必须是数字。';
    if (payload.totalValue < 0) return '总资产不能为负数。';
    if (!Number.isFinite(payload.netFlow)) return '净流入必须是数字。';
    return '';
}

function resolveSelectedAccount(accountId) {
    if (state.accounts.some(account => account.id === accountId)) return accountId;
    return state.accounts[0]?.id || '';
}

function persistAll() {
    saveAccounts(state.accounts);
    saveSnapshots(state.snapshots);
    persistPreferences();
}

function persistPreferences() {
    savePreferences({
        theme: state.theme,
        selectedAccountId: state.selectedAccountId,
        selectedPeriod: state.selectedPeriod,
        activeView: state.activeView
    });
}

function createId(prefix) {
    if (globalThis.crypto?.randomUUID) return `${prefix}-${globalThis.crypto.randomUUID()}`;
    return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

document.addEventListener('DOMContentLoaded', init);
