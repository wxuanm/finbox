import * as vscode from 'vscode';
import { FundQuoteService } from './services/fundQuoteService';
import { FundNavService } from './services/fundNavService';
import { StockQuoteService } from './services/stockQuoteService';
import { StorageService } from './services/storageService';
import { FundMonitorStore } from './state/fundMonitorStore';
import { TrendPanel } from './webviews/trendPanel';
import { FundGroupItem, FundItem, FundMonitorTreeProvider } from './views/fundMonitorTreeProvider';
import { SettingsTreeProvider } from './views/settingsTreeProvider';
import { StockItem, StockMonitorTreeProvider } from './views/stockMonitorTreeProvider';

const STOCK_AUTO_REFRESH_CONFIG = 'finbox.stock.autoRefresh';
const DEFAULT_STOCK_AUTO_REFRESH_MINUTES = 5;
const MIN_STOCK_AUTO_REFRESH_MINUTES = 1;

export function activate(context: vscode.ExtensionContext): void {
  const storage = new StorageService(context);
  const store = new FundMonitorStore(storage);
  const quoteService = new FundQuoteService();
  const stockQuoteService = new StockQuoteService();
  const navService = new FundNavService();
  const trendPanel = new TrendPanel(context.extensionUri, store, navService);
  const treeProvider = new FundMonitorTreeProvider(store, context.extensionUri);
  const stockTreeProvider = new StockMonitorTreeProvider(store, context.extensionUri);
  const settingsTreeProvider = new SettingsTreeProvider();
  const fundTreeView = vscode.window.createTreeView('finbox.fund', {
    treeDataProvider: treeProvider,
    showCollapseAll: false
  });
  const stockTreeView = vscode.window.createTreeView('finbox.stock', {
    treeDataProvider: stockTreeProvider,
    showCollapseAll: false
  });
  const settingsTreeView = vscode.window.createTreeView('finbox.settings', {
    treeDataProvider: settingsTreeProvider
  });
  let stockRefreshInFlight: Promise<void> | undefined;
  let stockAutoRefreshTimer: ReturnType<typeof setInterval> | undefined;

  async function refreshQuotes(): Promise<void> {
    const codes = store.getCodes();
    if (codes.length === 0) {
      treeProvider.refresh();
      return;
    }

    await vscode.window.withProgress({
      location: { viewId: 'finbox.fund' },
      title: '刷新基金...'
    }, async () => {
      const result = await quoteService.fetchQuotes(codes);
      store.setQuotes(result.quotes, result.failedCodes, result.updatedAt);
      if (result.failedCodes.length > 0) {
        vscode.window.showWarningMessage(`部分基金估值刷新失败: ${result.failedCodes.join(', ')}`);
      }
    });
  }

  async function refreshStockQuotes(options: { showProgress: boolean; showWarnings: boolean } = { showProgress: true, showWarnings: true }): Promise<void> {
    if (stockRefreshInFlight) return stockRefreshInFlight;
    stockRefreshInFlight = refreshStockQuotesCore(options).finally(() => {
      stockRefreshInFlight = undefined;
    });
    return stockRefreshInFlight;
  }

  async function refreshStockQuotesCore(options: { showProgress: boolean; showWarnings: boolean }): Promise<void> {
    const symbols = store.getStockSymbols();
    if (symbols.length === 0) {
      stockTreeProvider.refresh();
      return;
    }

    const runRefresh = async () => {
      const result = await stockQuoteService.fetchQuotes(symbols);
      store.setStockQuotes(result.quotes, result.failedSymbols, result.updatedAt);
      if (options.showWarnings && result.failedSymbols.length > 0) {
        vscode.window.showWarningMessage(`部分股票行情刷新失败: ${result.failedSymbols.join(', ')}`);
      }
    };

    if (!options.showProgress) {
      await runRefresh();
      return;
    }

    await vscode.window.withProgress({
      location: { viewId: 'finbox.stock' },
      title: '刷新股票...'
    }, runRefresh);
  }

  function restartStockAutoRefresh(): void {
    if (stockAutoRefreshTimer) clearInterval(stockAutoRefreshTimer);
    stockAutoRefreshTimer = undefined;

    const config = vscode.workspace.getConfiguration(STOCK_AUTO_REFRESH_CONFIG);
    if (!config.get<boolean>('enabled', false)) return;

    const intervalMinutes = Math.max(MIN_STOCK_AUTO_REFRESH_MINUTES, config.get<number>('intervalMinutes', DEFAULT_STOCK_AUTO_REFRESH_MINUTES));
    stockAutoRefreshTimer = setInterval(() => {
      if (!shouldRunStockAutoRefresh()) return;
      void refreshStockQuotes({ showProgress: false, showWarnings: false });
    }, intervalMinutes * 60 * 1000);

    if (shouldRunStockAutoRefresh()) {
      void refreshStockQuotes({ showProgress: false, showWarnings: false });
    }
  }

  function shouldRunStockAutoRefresh(): boolean {
    if (store.getStockSymbols().length === 0) return false;
    const config = vscode.workspace.getConfiguration(STOCK_AUTO_REFRESH_CONFIG);
    if (!config.get<boolean>('tradingHoursOnly', true)) return true;
    return isAshareTradingWindow(new Date());
  }

  async function openFinBoxSettings(settingId = 'finbox.stock'): Promise<void> {
    await vscode.commands.executeCommand('workbench.action.openSettings', settingId);
  }

  async function promptAddFund(groupId = 'default'): Promise<void> {
    const codes = await vscode.window.showInputBox({
      title: '添加基金',
      prompt: '输入六位基金代码，多个代码可用逗号或空格分隔',
      placeHolder: '例如 003026, 110022'
    });
    if (!codes) return;

    const addedCodes = await store.addFunds(codes, groupId);
    if (addedCodes.length === 0) {
      vscode.window.showWarningMessage('未识别到有效的六位基金代码。');
      return;
    }
    await refreshQuotes();
  }

  async function promptCreateGroup(): Promise<void> {
    const name = await vscode.window.showInputBox({
      title: '新建基金分组',
      prompt: '输入分组名称',
      placeHolder: '例如 稳健组合'
    });
    if (!name) return;

    const groupId = await store.createGroup(name);
    if (!groupId) vscode.window.showWarningMessage('分组名称无效或已存在。');
  }

  async function promptAddStock(): Promise<void> {
    const symbols = await vscode.window.showInputBox({
      title: '添加股票',
      prompt: '输入带 sh/sz 前缀的股票代码，多个代码可用逗号或空格分隔',
      placeHolder: '例如 sh000001, sz000001'
    });
    if (!symbols) return;

    const addedSymbols = await store.addStocks(symbols);
    if (addedSymbols.length === 0) {
      vscode.window.showWarningMessage('未识别到有效的股票代码。');
      return;
    }
    await refreshStockQuotes();
  }

  async function promptRenameGroup(item?: FundGroupItem): Promise<void> {
    if (!(item instanceof FundGroupItem) || item.group.id === 'default') return;
    const name = await vscode.window.showInputBox({
      title: '修改分组名称',
      prompt: '输入新的分组名称',
      value: item.group.name
    });
    if (!name) return;
    await store.renameGroup(item.group.id, name);
  }

  context.subscriptions.push(
    store,
    treeProvider,
    stockTreeProvider,
    settingsTreeProvider,
    fundTreeView,
    stockTreeView,
    settingsTreeView,
    vscode.commands.registerCommand('finbox.open', () => vscode.commands.executeCommand('workbench.view.extension.finbox')),
    vscode.commands.registerCommand('finbox.fund.refresh', () => refreshQuotes()),
    vscode.commands.registerCommand('finbox.stock.refresh', () => refreshStockQuotes()),
    vscode.commands.registerCommand('finbox.settings.open', (settingId?: string) => openFinBoxSettings(settingId)),
    vscode.commands.registerCommand('finbox.fund.add', () => promptAddFund('default')),
    vscode.commands.registerCommand('finbox.stock.add', () => promptAddStock()),
    vscode.commands.registerCommand('finbox.fund.addToGroup', (item?: FundGroupItem) => promptAddFund(item instanceof FundGroupItem ? item.group.id : 'default')),
    vscode.commands.registerCommand('finbox.fund.createGroup', () => promptCreateGroup()),
    vscode.commands.registerCommand('finbox.fund.renameGroup', (item?: FundGroupItem) => promptRenameGroup(item)),
    vscode.commands.registerCommand('finbox.fund.deleteGroup', async (item?: FundGroupItem) => {
      if (!(item instanceof FundGroupItem) || item.group.id === 'default') return;
      const confirm = await vscode.window.showWarningMessage(`删除分组“${item.group.name}”？组内基金将移至默认分组。`, { modal: true }, '删除');
      if (confirm === '删除') await store.deleteGroup(item.group.id);
    }),
    vscode.commands.registerCommand('finbox.fund.remove', async (item?: FundItem) => {
      if (!(item instanceof FundItem)) return;
      const confirm = await vscode.window.showWarningMessage(`移除基金 ${item.code}？`, { modal: true }, '移除');
      if (confirm === '移除') await store.removeFund(item.code);
    }),
    vscode.commands.registerCommand('finbox.stock.remove', async (item?: StockItem) => {
      if (!(item instanceof StockItem)) return;
      const confirm = await vscode.window.showWarningMessage(`移除股票 ${item.symbol}？`, { modal: true }, '移除');
      if (confirm === '移除') await store.removeStock(item.symbol);
    }),
    vscode.commands.registerCommand('finbox.stock.moveUp', async (item?: StockItem) => {
      if (item instanceof StockItem) await store.moveStock(item.symbol, 'up');
    }),
    vscode.commands.registerCommand('finbox.stock.moveDown', async (item?: StockItem) => {
      if (item instanceof StockItem) await store.moveStock(item.symbol, 'down');
    }),
    vscode.commands.registerCommand('finbox.fund.openTrend', (input?: string | FundItem) => {
      if (input instanceof FundItem) return trendPanel.openFund(input.code);
      if (typeof input === 'string' && input) return trendPanel.openFund(input);
      return vscode.window.showInputBox({ prompt: '输入六位基金代码' }).then(input => {
        if (input) return trendPanel.openFund(input.trim());
        return undefined;
      });
    }),
    vscode.commands.registerCommand('finbox.fund.openGroupTrend', (input?: string | FundGroupItem) => {
      if (input instanceof FundGroupItem) return trendPanel.openGroup(input.group.id);
      if (typeof input === 'string' && input) return trendPanel.openGroup(input);
      return trendPanel.openGroup('default');
    }),
    vscode.workspace.onDidChangeConfiguration(event => {
      if (event.affectsConfiguration(STOCK_AUTO_REFRESH_CONFIG)) {
        restartStockAutoRefresh();
      }
    }),
    new vscode.Disposable(() => {
      if (stockAutoRefreshTimer) clearInterval(stockAutoRefreshTimer);
    })
  );

  restartStockAutoRefresh();
}

export function deactivate(): void {}

function isAshareTradingWindow(date: Date): boolean {
  const day = date.getDay();
  if (day === 0 || day === 6) return false;

  const minutes = date.getHours() * 60 + date.getMinutes();
  return (minutes >= 9 * 60 + 25 && minutes <= 11 * 60 + 35)
    || (minutes >= 12 * 60 + 55 && minutes <= 15 * 60 + 5);
}
