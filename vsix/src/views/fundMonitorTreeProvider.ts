import * as vscode from 'vscode';
import { FundMonitorStore } from '../state/fundMonitorStore';
import { FundGroup, FundQuote } from '../types';

export type FundMonitorTreeItem = FundGroupItem | FundItem | EmptyItem;

export class FundMonitorTreeProvider implements vscode.TreeDataProvider<FundMonitorTreeItem> {
  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<FundMonitorTreeItem | undefined | null | void>();
  private refreshing = false;
  readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

  constructor(
    private readonly store: FundMonitorStore,
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

  getTreeItem(element: FundMonitorTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: FundMonitorTreeItem): FundMonitorTreeItem[] {
    if (!element) {
      const snapshot = this.store.snapshot();
      const codes = Object.keys(snapshot.fundGroups);

      const groups = snapshot.groups
        .filter(group => group.id !== 'default' || snapshot.groups.length === 1 || this.store.getCodesForGroup('default').length > 0)
        .map(group => new FundGroupItem(group, this.store.getCodesForGroup(group.id).length, this.refreshing));

      return groups.length > 0 ? groups : [new EmptyItem(codes.length === 0 ? '还没有监控基金。' : '没有可显示的基金分组。')];
    }

    if (element instanceof FundGroupItem) {
      const codes = this.store.getCodesForGroup(element.group.id).sort((a, b) => compareFundsByChange(a, b, this.store));
      if (codes.length === 0) return [new EmptyItem('此分组为空')];
      return codes.map(code => new FundItem(code, this.store.getQuote(code), this.store.snapshot().failedCodes.includes(code), this.extensionUri));
    }

    return [];
  }

  dispose(): void {
    this.onDidChangeTreeDataEmitter.dispose();
  }
}

function compareFundsByChange(a: string, b: string, store: FundMonitorStore): number {
  const changeA = store.getQuote(a)?.estimatedChange;
  const changeB = store.getQuote(b)?.estimatedChange;
  const hasChangeA = Number.isFinite(changeA);
  const hasChangeB = Number.isFinite(changeB);

  if (hasChangeA && hasChangeB && changeA !== changeB) return (changeB as number) - (changeA as number);
  if (hasChangeA !== hasChangeB) return hasChangeA ? -1 : 1;
  return a.localeCompare(b, 'en', { numeric: true });
}

export class FundGroupItem extends vscode.TreeItem {
  readonly contextValue: string;

  constructor(readonly group: FundGroup, count: number, refreshing: boolean) {
    super(`${group.name}(${count})`, vscode.TreeItemCollapsibleState.Expanded);
    this.id = `group:${group.id}`;
    this.tooltip = refreshing ? `${group.name} · ${count} 只基金 · 正在刷新` : `${group.name} · ${count} 只基金`;
    if (refreshing) this.iconPath = new vscode.ThemeIcon('sync~spin');
    this.contextValue = group.id === 'default' ? 'group' : 'groupCustom';
  }
}

export class FundItem extends vscode.TreeItem {
  readonly contextValue = 'fund';

  constructor(readonly code: string, quote: FundQuote | undefined, failed: boolean, extensionUri: vscode.Uri) {
    super(buildFundLabel(code, quote, failed), vscode.TreeItemCollapsibleState.None);
    this.id = `fund:${code}`;
    this.description = buildFundDescription(quote, failed);
    this.tooltip = buildFundTooltip(code, quote, failed);
    this.iconPath = buildFundIconPath(quote, failed, extensionUri);
    this.command = {
      command: 'finbox.fund.openTrend',
      title: '基金走势',
      arguments: [this]
    };
  }
}

class EmptyItem extends vscode.TreeItem {
  readonly contextValue = 'empty';

  constructor(message: string) {
    super(message, vscode.TreeItemCollapsibleState.None);
    this.iconPath = new vscode.ThemeIcon('info');
  }
}

function buildFundLabel(code: string, quote: FundQuote | undefined, failed: boolean): string {
  const change = failed ? '失败' : formatChange(quote?.estimatedChange);
  if (failed) return `${change}    ${code} [刷新失败]`;
  if (!quote) return `${change}    ${code} [等待刷新]`;
  return `${change}    [${quote.name || code}]`;
}

function buildFundDescription(quote: FundQuote | undefined, failed: boolean): string {
  return '';
}

function buildFundTooltip(code: string, quote: FundQuote | undefined, failed: boolean): string {
  if (failed) return `${code}\n估值刷新失败`;
  if (!quote) return `${code}\n等待刷新`;
  return [
    `${quote.name} (${code})`,
    `估算净值: ${quote.estimatedNav || '-'}    估算涨幅: ${formatChange(quote.estimatedChange)}`,
    `披露净值: ${quote.unitNav || '-'}    披露涨幅: ${formatChange(quote.navChange)}`,
    `披露日期: ${quote.unitNavDate || '-'}    经理: ${quote.manager || '-'}`
  ].join('\n');
}

function formatChange(value: number | null | undefined): string {
  if (!Number.isFinite(value)) return '--';
  const numericValue = value as number;
  return `${numericValue >= 0 ? '+' : ''}${numericValue.toFixed(2)}%`;
}

function buildFundIconPath(quote: FundQuote | undefined, failed: boolean, extensionUri: vscode.Uri): vscode.ThemeIcon | vscode.Uri {
  if (!failed && quote?.estimatedChange !== null && quote?.estimatedChange !== undefined) {
    const isStrongMove = Math.abs(quote.estimatedChange) >= 2;
    const iconName = quote.estimatedChange >= 0
      ? (isStrongMove ? 'double-up.svg' : 'up.svg')
      : (isStrongMove ? 'double-down.svg' : 'down.svg');
    return vscode.Uri.joinPath(extensionUri, 'media', 'icons', iconName);
  }

  return new vscode.ThemeIcon(buildFundIcon(quote, failed), buildFundIconColor(quote, failed));
}

function buildFundIcon(quote: FundQuote | undefined, failed: boolean): string {
  if (failed) return 'error';
  if (!quote || quote.estimatedChange === null) return 'circle-outline';
  if (quote.estimatedChange >= 0) return 'arrow-up';
  if (quote.estimatedChange < 0) return 'arrow-down';
  return 'dash';
}

function buildFundIconColor(quote: FundQuote | undefined, failed: boolean): vscode.ThemeColor | undefined {
  if (failed) return new vscode.ThemeColor('errorForeground');
  if (!quote || quote.estimatedChange === null) return new vscode.ThemeColor('descriptionForeground');
  if (quote.estimatedChange >= 0) return new vscode.ThemeColor('charts.red');
  if (quote.estimatedChange < 0) return new vscode.ThemeColor('charts.green');
  return new vscode.ThemeColor('descriptionForeground');
}
