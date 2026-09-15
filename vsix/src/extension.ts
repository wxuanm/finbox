import * as vscode from 'vscode';
import { FundQuoteService } from './services/fundQuoteService';
import { FundNavService } from './services/fundNavService';
import { StockQuoteService } from './services/stockQuoteService';
import { StorageService } from './services/storageService';
import { FinBoxStore } from './state/finboxStore';
import { FundTrendPanel } from './webviews/fundTrendPanel';
import { StockTrendPanel } from './webviews/stockTrendPanel';
import { FundGroupItem, FundItem, FundMonitorTreeProvider } from './views/fundMonitorTreeProvider';
import { SettingsTreeProvider } from './views/settingsTreeProvider';
import { StockItem, StockMonitorTreeProvider } from './views/stockMonitorTreeProvider';

const STOCK_AUTO_REFRESH_CONFIG = 'finbox.stock.autoRefresh';
const DEFAULT_STOCK_AUTO_REFRESH_MINUTES = 5;
const MIN_STOCK_AUTO_REFRESH_MINUTES = 1;

export function activate(context: vscode.ExtensionContext): void {
  const storage = new StorageService(context);
  const store = new FinBoxStore(storage);
  const quoteService = new FundQuoteService();
  const stockQuoteService = new StockQuoteService();
  const navService = new FundNavService();
  const fundTrendPanel = new FundTrendPanel(context.extensionUri, store, navService);
  const stockTrendPanel = new StockTrendPanel(store);
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
  let stockTreeVisible = stockTreeView.visible;

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
      treeProvider.setRefreshing(true);
      try {
        const result = await quoteService.fetchQuotes(codes);
        store.setQuotes(result.quotes, result.failedCodes, result.updatedAt);
        if (result.failedCodes.length > 0) {
          vscode.window.showWarningMessage(`部分基金估值刷新失败: ${result.failedCodes.join(', ')}`);
        }
      } finally {
        treeProvider.setRefreshing(false);
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

    stockTreeProvider.setRefreshing(true);
    try {
      if (!options.showProgress) {
        await runRefresh();
        return;
      }

      await vscode.window.withProgress({
        location: { viewId: 'finbox.stock' },
        title: '刷新股票...'
      }, runRefresh);
    } finally {
      stockTreeProvider.setRefreshing(false);
    }
  }

  function restartStockAutoRefresh(): void {
    stopStockAutoRefresh();

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

  function stopStockAutoRefresh(): void {
    if (stockAutoRefreshTimer) clearInterval(stockAutoRefreshTimer);
    stockAutoRefreshTimer = undefined;
  }

  function shouldRunStockAutoRefresh(): boolean {
    if (store.getStockSymbols().length === 0) return false;
    const config = vscode.workspace.getConfiguration(STOCK_AUTO_REFRESH_CONFIG);
    if (!config.get<boolean>('tradingHoursOnly', true)) return true;
    return isAshareTradingWindow(new Date());
  }

  async function openFinBoxSettings(settingId = '@ext:finx.finbox'): Promise<void> {
    await vscode.commands.executeCommand('workbench.action.openSettings', settingId);
  }

  async function promptAddFund(groupId = 'default'): Promise<void> {
    const codes = await vscode.window.showInputBox({
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
      prompt: '输入分组名称',
      placeHolder: '例如 稳健组合'
    });
    if (!name) return;

    const groupId = await store.createGroup(name);
    if (!groupId) vscode.window.showWarningMessage('分组名称无效或已存在。');
  }

  async function promptAddStock(): Promise<void> {
    const symbols = await vscode.window.showInputBox({
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
      prompt: '输入新的分组名称',
      value: item.group.name
    });
    if (!name) return;
    await store.renameGroup(item.group.id, name);
  }

  async function exportConfig(): Promise<void> {
    const target = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.file(`finbox-config-${new Date().toISOString().slice(0, 10)}.json`),
      filters: { JSON: ['json'] },
      saveLabel: '导出'
    });
    if (!target) return;

    const content = JSON.stringify(store.exportConfig(), null, 2);
    await vscode.workspace.fs.writeFile(target, encodeUtf8(content));
    vscode.window.showInformationMessage('FinBox 配置已导出。');
  }

  async function importConfig(): Promise<void> {
    const sources = await vscode.window.showOpenDialog({
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: false,
      filters: { JSON: ['json'] },
      openLabel: '导入'
    });
    const source = sources?.[0];
    if (!source) return;

    let parsed: unknown;
    try {
      parsed = JSON.parse(decodeUtf8(await vscode.workspace.fs.readFile(source)));
    } catch {
      vscode.window.showErrorMessage('FinBox 配置文件不是有效的 JSON。');
      return;
    }

    let preview: { groups: number; funds: number; stocks: number };
    try {
      preview = store.previewConfigImport(parsed);
    } catch (error) {
      vscode.window.showErrorMessage(error instanceof Error ? error.message : 'FinBox 配置文件格式无效。');
      return;
    }

    const confirm = await vscode.window.showWarningMessage(
      `将合并导入 ${preview.groups} 个分组、${preview.funds} 只基金、${preview.stocks} 只股票。当前配置会保留。`,
      { modal: true },
      '合并导入'
    );
    if (confirm !== '合并导入') return;

    try {
      const result = await store.importConfig(parsed);
      vscode.window.showInformationMessage(`FinBox 配置已合并：${result.groups} 个分组、${result.funds} 只基金、${result.stocks} 只股票。`);
    } catch (error) {
      vscode.window.showErrorMessage(error instanceof Error ? error.message : 'FinBox 配置导入失败。');
    }
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
    vscode.commands.registerCommand('finbox.config.export', () => exportConfig()),
    vscode.commands.registerCommand('finbox.config.import', () => importConfig()),
    vscode.commands.registerCommand('finbox.fund.add', () => promptAddFund('default')),
    vscode.commands.registerCommand('finbox.stock.add', () => promptAddStock()),
    vscode.commands.registerCommand('finbox.fund.addToGroup', (item?: FundGroupItem) => promptAddFund(item instanceof FundGroupItem ? item.group.id : 'default')),
    vscode.commands.registerCommand('finbox.fund.createGroup', () => promptCreateGroup()),
    vscode.commands.registerCommand('finbox.fund.renameGroup', (item?: FundGroupItem) => promptRenameGroup(item)),
    vscode.commands.registerCommand('finbox.fund.deleteGroup', async (item?: FundGroupItem) => {
      if (!(item instanceof FundGroupItem) || item.group.id === 'default') return;
      const confirm = await vscode.window.showWarningMessage(`删除分组“${item.group.name}”？组内基金将移至 Default。`, { modal: true }, '删除');
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
    vscode.commands.registerCommand('finbox.stock.openTrend', (input?: string | StockItem) => {
      if (input instanceof StockItem) return stockTrendPanel.open(input.symbol);
      if (typeof input === 'string' && input) return stockTrendPanel.open(input);
      return vscode.window.showInputBox({
        prompt: '输入带 sh/sz 前缀的股票代码',
        placeHolder: '例如 sh600519, sz000001'
      }).then(input => {
        if (input) return stockTrendPanel.open(input.trim());
        return undefined;
      });
    }),
    vscode.commands.registerCommand('finbox.fund.openTrend', (input?: string | FundItem) => {
      if (input instanceof FundItem) return fundTrendPanel.openFund(input.code);
      if (typeof input === 'string' && input) return fundTrendPanel.openFund(input);
      return vscode.window.showInputBox({ prompt: '输入六位基金代码' }).then(input => {
        if (input) return fundTrendPanel.openFund(input.trim());
        return undefined;
      });
    }),
    vscode.commands.registerCommand('finbox.fund.openGroupTrend', (input?: string | FundGroupItem) => {
      if (input instanceof FundGroupItem) return fundTrendPanel.openGroup(input.group.id);
      if (typeof input === 'string' && input) return fundTrendPanel.openGroup(input);
      return fundTrendPanel.openGroup('default');
    }),
    stockTreeView.onDidChangeVisibility(event => {
      stockTreeVisible = event.visible;
      if (event.visible) {
        restartStockAutoRefresh();
      } else {
        stopStockAutoRefresh();
      }
    }),
    vscode.workspace.onDidChangeConfiguration(event => {
      if (event.affectsConfiguration(STOCK_AUTO_REFRESH_CONFIG)) {
        if (stockTreeVisible) {
          restartStockAutoRefresh();
        } else {
          stopStockAutoRefresh();
        }
      }
    }),
    new vscode.Disposable(() => {
      stopStockAutoRefresh();
    })
  );

  if (stockTreeVisible) restartStockAutoRefresh();
}

export function deactivate(): void {}

function isAshareTradingWindow(date: Date): boolean {
  const day = date.getDay();
  if (day === 0 || day === 6) return false;

  const minutes = date.getHours() * 60 + date.getMinutes();
  return (minutes >= 9 * 60 + 25 && minutes <= 11 * 60 + 35)
    || (minutes >= 12 * 60 + 55 && minutes <= 15 * 60 + 5);
}

function encodeUtf8(value: string): Uint8Array {
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(value);

  const bytes: number[] = [];
  for (let index = 0; index < value.length; index += 1) {
    let codePoint = value.codePointAt(index) || 0;
    if (codePoint > 0xffff) index += 1;

    if (codePoint <= 0x7f) {
      bytes.push(codePoint);
    } else if (codePoint <= 0x7ff) {
      bytes.push(0xc0 | (codePoint >> 6), 0x80 | (codePoint & 0x3f));
    } else if (codePoint <= 0xffff) {
      bytes.push(0xe0 | (codePoint >> 12), 0x80 | ((codePoint >> 6) & 0x3f), 0x80 | (codePoint & 0x3f));
    } else {
      bytes.push(0xf0 | (codePoint >> 18), 0x80 | ((codePoint >> 12) & 0x3f), 0x80 | ((codePoint >> 6) & 0x3f), 0x80 | (codePoint & 0x3f));
    }
  }

  return Uint8Array.from(bytes);
}

function decodeUtf8(bytes: Uint8Array): string {
  if (typeof TextDecoder !== 'undefined') return new TextDecoder('utf-8').decode(bytes);

  let output = '';
  for (let index = 0; index < bytes.length;) {
    const first = bytes[index++];
    if (first < 0x80) {
      output += String.fromCodePoint(first);
    } else if (first >= 0xc0 && first < 0xe0 && index < bytes.length) {
      output += String.fromCodePoint(((first & 0x1f) << 6) | (bytes[index++] & 0x3f));
    } else if (first >= 0xe0 && first < 0xf0 && index + 1 < bytes.length) {
      output += String.fromCodePoint(((first & 0x0f) << 12) | ((bytes[index++] & 0x3f) << 6) | (bytes[index++] & 0x3f));
    } else if (first >= 0xf0 && first < 0xf8 && index + 2 < bytes.length) {
      output += String.fromCodePoint(((first & 0x07) << 18) | ((bytes[index++] & 0x3f) << 12) | ((bytes[index++] & 0x3f) << 6) | (bytes[index++] & 0x3f));
    } else {
      output += '\ufffd';
    }
  }

  return output;
}
