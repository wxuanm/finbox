import * as vscode from 'vscode';
import { FinBoxStore } from '../state/finboxStore';
import { StockQuote } from '../types';

export type StockMonitorTreeItem = StockGroupItem | StockItem | StockEmptyItem;

export class StockMonitorTreeProvider implements vscode.TreeDataProvider<StockMonitorTreeItem> {
  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<StockMonitorTreeItem | undefined | null | void>();
  private refreshing = false;
  readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

  constructor(
    private readonly store: FinBoxStore,
    private readonly extensionUri: vscode.Uri
  ) {
    this.store.onDidChange(() => this.refresh());
  }

  refresh(): void {
    this.onDidChangeTreeDataEmitter.fire();
  }

  setRefreshing(refreshing: boolean): void {
    if (this.refreshing === refreshing) return;
    this.refreshing = refreshing;
    this.refresh();
  }

  getTreeItem(element: StockMonitorTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: StockMonitorTreeItem): StockMonitorTreeItem[] {
    if (!element) {
      return [new StockGroupItem(this.store.getStockSymbols().length, this.refreshing)];
    }

    if (element instanceof StockGroupItem) {
      const symbols = this.store.getStockSymbols();
      if (symbols.length === 0) return [new StockEmptyItem('还没有监控股票。')];
      const failedSymbols = this.store.stockSnapshot().failedSymbols;
      return symbols.map(symbol => new StockItem(symbol, this.store.getStockQuote(symbol), failedSymbols.includes(symbol), this.extensionUri));
    }

    return [];
  }

  dispose(): void {
    this.onDidChangeTreeDataEmitter.dispose();
  }
}

export class StockGroupItem extends vscode.TreeItem {
  readonly contextValue = 'stockGroup';

  constructor(count: number, refreshing: boolean) {
    super(`A Stock(${count})`, vscode.TreeItemCollapsibleState.Expanded);
    this.id = 'stock-group:cn';
    this.tooltip = refreshing ? `A Stock · ${count} 只股票 · 正在刷新` : `A Stock · ${count} 只股票`;
    if (refreshing) this.iconPath = new vscode.ThemeIcon('sync~spin');
  }
}

export class StockItem extends vscode.TreeItem {
  readonly contextValue = 'stock';

  constructor(readonly symbol: string, quote: StockQuote | undefined, failed: boolean, extensionUri: vscode.Uri) {
    super(buildStockLabel(symbol, quote, failed), vscode.TreeItemCollapsibleState.None);
    this.id = `stock:${symbol}`;
    this.description = '';
    this.tooltip = buildStockTooltip(symbol, quote, failed);
    this.iconPath = buildStockIconPath(quote, failed, extensionUri);
    this.command = {
      command: 'finbox.stock.openTrend',
      title: '股票实时走势',
      arguments: [this]
    };
  }
}

class StockEmptyItem extends vscode.TreeItem {
  readonly contextValue = 'empty';

  constructor(message: string) {
    super(message, vscode.TreeItemCollapsibleState.None);
    this.iconPath = new vscode.ThemeIcon('info');
  }
}

function buildStockLabel(symbol: string, quote: StockQuote | undefined, failed: boolean): string {
  if (failed) return `失败    ${formatPriceColumn(null)}    ${symbol}[刷新失败]`;
  if (!quote) return `--    ${formatPriceColumn(null)}    ${symbol}[等待刷新]`;
  return `${formatChange(quote.changePct)}    ${formatPriceColumn(quote.price)}    [${quote.name || symbol}]`;
}

function buildStockTooltip(symbol: string, quote: StockQuote | undefined, failed: boolean): string {
  if (failed) return `${symbol}\n行情刷新失败`;
  if (!quote) return `${symbol}\n等待刷新`;
  return [
    `${quote.name || symbol} (${symbol})`,
    `涨幅: ${formatChange(quote.changePct)}    涨跌: ${formatSignedPrice(quote.changeAmount)}`,
    `最高: ${formatPrice(quote.highPrice)}    最低: ${formatPrice(quote.lowPrice)}`,
    `今开: ${formatPrice(quote.openPrice)}    昨收: ${formatPrice(quote.previousClose)}`,
    `成交量: ${formatVolume(quote.volume)}    成交额: ${formatAmount(quote.amount)}`
  ].join('\n');
}

function buildStockIconPath(quote: StockQuote | undefined, failed: boolean, extensionUri: vscode.Uri): vscode.ThemeIcon | vscode.Uri {
  if (!failed && quote?.changePct !== null && quote?.changePct !== undefined) {
    const isStrongMove = Math.abs(quote.changePct) >= 2;
    const iconName = quote.changePct >= 0
      ? (isStrongMove ? 'double-up.svg' : 'up.svg')
      : (isStrongMove ? 'double-down.svg' : 'down.svg');
    return vscode.Uri.joinPath(extensionUri, 'media', 'icons', iconName);
  }

  return new vscode.ThemeIcon(buildStockIcon(quote, failed), buildStockIconColor(quote, failed));
}

function buildStockIcon(quote: StockQuote | undefined, failed: boolean): string {
  if (failed) return 'error';
  if (!quote || quote.changePct === null) return 'circle-outline';
  return 'dash';
}

function buildStockIconColor(quote: StockQuote | undefined, failed: boolean): vscode.ThemeColor | undefined {
  if (failed) return new vscode.ThemeColor('errorForeground');
  return new vscode.ThemeColor('descriptionForeground');
}

function formatChange(value: number | null | undefined): string {
  if (!Number.isFinite(value)) return '--';
  const numericValue = value as number;
  return `${numericValue >= 0 ? '+' : ''}${numericValue.toFixed(2)}%`;
}

function formatPrice(value: number | null | undefined): string {
  if (!Number.isFinite(value)) return '--';
  return (value as number).toFixed(2);
}

function formatPriceColumn(value: number | null | undefined): string {
  return formatPrice(value).padEnd(7, ' ');
}

function formatSignedPrice(value: number | null | undefined): string {
  if (!Number.isFinite(value)) return '--';
  const numericValue = value as number;
  return `${numericValue >= 0 ? '+' : ''}${numericValue.toFixed(2)}`;
}

function formatVolume(value: number | null | undefined): string {
  if (!Number.isFinite(value)) return '--';
  const numericValue = value as number;
  if (numericValue >= 100000000) return `${(numericValue / 100000000).toFixed(2)}亿`;
  if (numericValue >= 10000) return `${(numericValue / 10000).toFixed(2)}万`;
  return numericValue.toFixed(0);
}

function formatAmount(value: number | null | undefined): string {
  if (!Number.isFinite(value)) return '--';
  const numericValue = value as number;
  if (numericValue >= 100000000) return `${(numericValue / 100000000).toFixed(2)}亿`;
  if (numericValue >= 10000) return `${(numericValue / 10000).toFixed(2)}万`;
  return numericValue.toFixed(0);
}
