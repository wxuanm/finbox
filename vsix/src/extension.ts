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
const MAX_FUND_COMPARE_CODES = 10;
const PICK_ICON_SELECTED = '$(check)';
const PICK_ICON_PARTIAL = '$(dash)';
const PICK_ICON_UNSELECTED = '$(circle-large-outline)';

type FundComparePickItem = vscode.QuickPickItem & { code?: string; groupName?: string; groupCodes?: string[] };

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
  let fundCompareCodes = new Set<string>();

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

  async function promptOpenFundCompare(): Promise<void> {
    const codes = store.getCodes();
    if (codes.length < 2) {
      vscode.window.showWarningMessage('至少需要监控 2 只基金才能进行对比。');
      return;
    }

    const picked = await pickFundCompareCodes(codes);
    if (!picked) return;
    if (picked.length < 2) {
      vscode.window.showWarningMessage('请选择至少 2 只基金进行对比。');
      return;
    }
    if (picked.length > MAX_FUND_COMPARE_CODES) {
      vscode.window.showWarningMessage(`基金对比最多支持 ${MAX_FUND_COMPARE_CODES} 只。`);
      return;
    }

    fundCompareCodes = new Set(picked);
    await promptFundCompareAction();
  }

  async function pickFundCompareCodes(codes: string[]): Promise<string[] | undefined> {
    const quickPick = vscode.window.createQuickPick<FundComparePickItem>();
    const doneButton: vscode.QuickInputButton = {
      iconPath: new vscode.ThemeIcon('arrow-right'),
      tooltip: '下一步：确认选择'
    };
    const selectedCodes = new Set(fundCompareCodes);
    let settled = false;

    quickPick.canSelectMany = false;
    quickPick.matchOnDescription = true;
    quickPick.matchOnDetail = true;
    quickPick.keepScrollPosition = true;
    quickPick.buttons = [doneButton];
    quickPick.title = '基金对比 1/2 - 选择基金';

    const clearActiveSelection = () => {
      quickPick.activeItems = [];
    };
    const refreshItems = () => {
      quickPick.placeholder = `已选 ${selectedCodes.size}/${MAX_FUND_COMPARE_CODES} · 点击或回车切换基金/分组`;
      quickPick.items = buildFundComparePickItems(codes, selectedCodes);
      clearActiveSelection();
    };
    refreshItems();

    return new Promise(resolve => {
      const disposables: vscode.Disposable[] = [];
      const finish = (selectedCodes: string[] | undefined) => {
        if (settled) return;
        settled = true;
        disposables.forEach(disposable => disposable.dispose());
        quickPick.dispose();
        resolve(selectedCodes);
      };
      const toggleItem = (item: FundComparePickItem | undefined) => {
        if (!item) return;
        if (item.groupCodes) {
          const shouldClearGroup = item.groupCodes.length > 0 && item.groupCodes.every(code => selectedCodes.has(code));
          if (shouldClearGroup) {
            item.groupCodes.forEach(code => selectedCodes.delete(code));
            refreshItems();
            return;
          }

          let truncated = false;
          item.groupCodes.forEach(code => {
            if (selectedCodes.has(code)) return;
            if (selectedCodes.size < MAX_FUND_COMPARE_CODES) {
              selectedCodes.add(code);
            } else {
              truncated = true;
            }
          });
          refreshItems();
          if (truncated) vscode.window.showWarningMessage(`基金对比最多支持 ${MAX_FUND_COMPARE_CODES} 只，已选到上限。`);
          return;
        }

        if (!item.code) return;
        if (selectedCodes.has(item.code)) {
          selectedCodes.delete(item.code);
        } else if (selectedCodes.size < MAX_FUND_COMPARE_CODES) {
          selectedCodes.add(item.code);
        } else {
          vscode.window.showWarningMessage(`基金对比最多支持 ${MAX_FUND_COMPARE_CODES} 只。`);
        }
        refreshItems();
      };

      disposables.push(
        quickPick.onDidAccept(() => toggleItem(quickPick.activeItems[0])),
        quickPick.onDidTriggerButton(button => {
          if (button === doneButton) {
            if (selectedCodes.size < 2) {
              vscode.window.showWarningMessage('请选择至少 2 只基金进行对比。');
              return;
            }
            finish([...selectedCodes]);
            return;
          }
        }),
        quickPick.onDidHide(() => finish(undefined))
      );

      quickPick.show();
      clearActiveSelection();
    });
  }

  async function promptFundCompareAction(): Promise<void> {
    if (fundCompareCodes.size < 2) {
      vscode.window.showWarningMessage('请选择至少 2 只基金进行对比。');
      return;
    }

    const action = await vscode.window.showQuickPick(
      [
        { label: '$(git-compare) 打开对比', description: `${fundCompareCodes.size} 只基金` },
        { label: '$(edit) 重新选择', description: '返回基金选择列表' }
      ],
      {
        title: '基金对比 2/2 - 选择操作',
        matchOnDescription: true
      }
    );
    if (!action) return;
    if (action.label.includes('打开对比')) {
      await openFundCompare([...fundCompareCodes], true);
      return;
    }
    if (action.label.includes('重新选择')) {
      await promptOpenFundCompare();
      return;
    }
  }

  async function addFundToCompare(input?: string | FundItem): Promise<void> {
    const code = input instanceof FundItem ? input.code : typeof input === 'string' ? input : '';
    if (!code || !store.getCodes().includes(code)) return;
    if (fundCompareCodes.has(code)) {
      vscode.window.showInformationMessage(`基金 ${code} 已在对比中。当前 ${fundCompareCodes.size}/${MAX_FUND_COMPARE_CODES}`);
      return;
    }
    if (fundCompareCodes.size >= MAX_FUND_COMPARE_CODES) {
      vscode.window.showWarningMessage(`基金对比最多支持 ${MAX_FUND_COMPARE_CODES} 只。`);
      return;
    }

    fundCompareCodes.add(code);
    const label = store.getQuote(code)?.name || code;
    const actions = fundCompareCodes.size >= 2 ? ['打开对比', '清空对比'] : ['清空对比'];
    const action = await vscode.window.showInformationMessage(`已加入对比：${label} ${code}。当前 ${fundCompareCodes.size}/${MAX_FUND_COMPARE_CODES}`, ...actions);
    if (action === '打开对比') await openFundCompare([...fundCompareCodes], true);
    if (action === '清空对比') fundCompareCodes.clear();
  }

  async function openFundCompare(codes: string[], clearBasket: boolean): Promise<void> {
    if (codes.length < 2) {
      vscode.window.showWarningMessage('请选择至少 2 只基金进行对比。');
      return;
    }
    if (codes.length > MAX_FUND_COMPARE_CODES) {
      vscode.window.showWarningMessage(`基金对比最多支持 ${MAX_FUND_COMPARE_CODES} 只。`);
      return;
    }

    await fundTrendPanel.openCompare(codes);
    if (clearBasket) fundCompareCodes.clear();
  }

  function buildFundComparePickItems(codes: string[], selectedCodes: Set<string>): FundComparePickItem[] {
    const snapshot = store.snapshot();
    const itemsByGroup = new Map<string, Array<FundComparePickItem & { code: string }>>();
    codes
      .map(code => {
        const quote = store.getQuote(code);
        const group = store.getGroup(snapshot.fundGroups[code] || 'default');
        const selected = selectedCodes.has(code);
        return {
          label: formatFundPickLabel(code, quote, selected),
          description: formatFundPickDescription(quote),
          groupName: group?.name || 'Default',
          code
        };
      })
      .sort((a, b) => a.groupName.localeCompare(b.groupName, 'zh-Hans-CN', { numeric: true })
        || a.code.localeCompare(b.code, 'en', { numeric: true }))
      .forEach(({ groupName, ...item }) => {
        const groupItems = itemsByGroup.get(groupName) || [];
        groupItems.push(item);
        itemsByGroup.set(groupName, groupItems);
      });

    return [
      ...[...itemsByGroup.entries()].flatMap(([groupName, items]) => [
        {
          label: formatGroupPickLabel(groupName, items, selectedCodes),
          description: formatGroupPickDescription(items, selectedCodes),
          groupName,
          groupCodes: items.map(item => item.code)
        },
        ...items
      ])
    ];
  }

  function getGroupPickIcon(items: Array<FundComparePickItem & { code: string }>, selectedCodes: Set<string>): string {
    const selectedCount = items.filter(item => selectedCodes.has(item.code)).length;
    if (selectedCount === items.length && items.length > 0) return PICK_ICON_SELECTED;
    if (selectedCount > 0) return PICK_ICON_PARTIAL;
    return PICK_ICON_UNSELECTED;
  }

  function getFundPickIcon(selected: boolean): string {
    return selected ? PICK_ICON_SELECTED : PICK_ICON_UNSELECTED;
  }

  function formatGroupPickLabel(groupName: string, items: Array<FundComparePickItem & { code: string }>, selectedCodes: Set<string>): string {
    return `${getGroupPickIcon(items, selectedCodes)} ${groupName}`;
  }

  function formatFundPickLabel(code: string, quote: ReturnType<FinBoxStore['getQuote']>, selected: boolean): string {
    return `$(blank)   ${getFundPickIcon(selected)} ${quote?.name ? `${quote.name} (${code})` : code}`;
  }

  function formatFundPickDescription(quote: ReturnType<FinBoxStore['getQuote']>): string | undefined {
    return quote?.manager || undefined;
  }

  function formatGroupPickDescription(items: Array<FundComparePickItem & { code: string }>, selectedCodes: Set<string>): string {
    const selectedCount = items.filter(item => selectedCodes.has(item.code)).length;
    if (selectedCount === items.length && items.length > 0) return `已全选 ${selectedCount}/${items.length} · Enter 取消`;
    if (selectedCount > 0) return `部分选中 ${selectedCount}/${items.length} · Enter 补全`;
    return `未选中 0/${items.length} · Enter 全选`;
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
    vscode.commands.registerCommand('finbox.fund.openCompareTrend', () => promptOpenFundCompare()),
    vscode.commands.registerCommand('finbox.fund.addToCompare', (item?: string | FundItem) => addFundToCompare(item)),
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
