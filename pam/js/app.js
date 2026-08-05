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

function init() {
    const preferences = loadPreferences();
    state.accounts = loadAccounts();
    state.snapshots = loadSnapshots();
    state.holdings = loadHoldings();
    state.theme = preferences.theme || 'light';
    state.selectedPeriod = preferences.selectedPeriod || '3M';
    state.activeView = preferences.activeView || 'analysis';
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
    document.getElementById('demoDataBtn')?.addEventListener('click', addDemoData);
    document.getElementById('exportDataBtn')?.addEventListener('click', exportData);
    document.getElementById('importDataBtn')?.addEventListener('click', () => document.getElementById('importDataInput')?.click());
    document.getElementById('importDataInput')?.addEventListener('change', importData);
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
    bindSnapshotTableAccountSwitch(selectAccount);
    bindHoldingsPanel({
        onFilter: updateHoldingFilter,
        onSubmit: saveHolding,
        onCancelEdit: () => {
            resetHoldingForm();
            showHoldingMessage('已取消编辑。');
            renderApp();
        },
        onEdit: editHolding,
        onDelete: deleteHolding,
        onSort: sortHoldings,
        onRefreshQuotes: refreshHoldingQuotes
    });
    window.addEventListener('resize', resizeChart, { passive: true });
}

function renderApp() {
    state.selectedAccountId = resolveSelectedAccount(state.selectedAccountId);
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
    state.activeView = ['data', 'holdings'].includes(view) ? view : 'analysis';
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
    const demoHoldings = [
        [steady.id, '510300', '沪深300ETF', 'fund', 'Fund', 18000, 4.25, 4.42],
        [steady.id, '019547', '中短债基金', 'fund', 'Fund', 30000, 1.03, 1.05],
        [growth.id, '600519', '贵州茅台', 'stock', 'CN', 30, 1550, 1680],
        [growth.id, '300750', '宁德时代', 'stock', 'CN', 200, 185, 205],
        [hk.id, '00700', '腾讯控股', 'stock', 'HK', 100, 310, 335],
        [us.id, 'AAPL', 'Apple', 'stock', 'US', 80, 180, 195],
        [pension.id, '017512', '养老目标基金', 'fund', 'Fund', 42000, 1.08, 1.12],
        [tactical.id, '159915', '创业板ETF', 'fund', 'Fund', 25000, 1.85, 1.76]
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
        asOfDate: '2026-06-02',
        note: ''
    }));

    state.accounts.push(...demoAccounts);
    state.snapshots.push(...demoSnapshots);
    state.holdings.push(...demoHoldings);
    state.selectedAccountId = steady.id;
    state.selectedPeriod = '3M';
    state.activeView = 'analysis';
    persistAll();
    showFormMessage('示例数据已添加，可在账户列表中查看。');
    renderApp();
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
            state.activeView = ['data', 'holdings'].includes(data.preferences.activeView) ? data.preferences.activeView : 'analysis';
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
        market: ['CN', 'Fund', 'HK', 'US', 'Other'].includes(holding.market) ? holding.market : 'Other',
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

    resetHoldingForm();
    persistAll();
    renderApp();
}

function editHolding(holdingId) {
    if (!state.holdings.some(holding => holding.id === holdingId)) return;
    state.editingHoldingId = holdingId;
    state.activeView = 'holdings';
    renderApp();
}

function deleteHolding(holdingId) {
    const holding = state.holdings.find(item => item.id === holdingId);
    if (!holding) return;
    if (!confirm(`确认删除持仓「${holding.name}」吗？`)) return;
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
    const supported = state.holdings.filter(holding => ['CN', 'Fund'].includes(holding.market) && holding.symbol);
    if (supported.length === 0) {
        showHoldingMessage('没有可刷新行情的 A股或基金持仓。', true);
        return;
    }

    try {
        showHoldingMessage('正在刷新行情...');
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
    }
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
    saveHoldings(state.holdings);
    persistPreferences();
}

function persistPreferences() {
    savePreferences({
        theme: state.theme,
        selectedAccountId: state.selectedAccountId,
        selectedPeriod: state.selectedPeriod,
        activeView: state.activeView,
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
