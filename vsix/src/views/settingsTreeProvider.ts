import * as vscode from 'vscode';
import { FundMonitorStore } from '../state/fundMonitorStore';

const STOCK_AUTO_REFRESH_CONFIG = 'finbox.stock.autoRefresh';

export class SettingsTreeProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<vscode.TreeItem | undefined | null | void>();
  private readonly storeListener: vscode.Disposable;
  readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

  constructor(private readonly store: FundMonitorStore) {
    this.storeListener = this.store.onDidChange(() => this.refresh());
  }

  refresh(): void {
    this.onDidChangeTreeDataEmitter.fire();
  }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(): vscode.TreeItem[] {
    const config = vscode.workspace.getConfiguration(STOCK_AUTO_REFRESH_CONFIG);
    const enabled = config.get<boolean>('enabled', false);
    const intervalMinutes = Math.max(1, config.get<number>('intervalMinutes', 5));
    const tradingHoursOnly = config.get<boolean>('tradingHoursOnly', true);
    const stockState = this.store.stockSnapshot();

    return [
      createSettingItem('Stock Auto Refresh', enabled ? 'On' : 'Off', 'sync', 'finbox.stock.autoRefresh.enabled'),
      createSettingItem('Interval', `${intervalMinutes} min`, 'watch', 'finbox.stock.autoRefresh.intervalMinutes'),
      createSettingItem('Trading Hours Only', tradingHoursOnly ? 'On' : 'Off', 'calendar', 'finbox.stock.autoRefresh.tradingHoursOnly'),
      createStatusItem('Trading Window', tradingHoursOnly ? formatTradingWindowStatus(new Date()) : 'Ignored', tradingHoursOnly ? 'pulse' : 'circle-slash'),
      createStatusItem('Tracked Stocks', String(stockState.stockSymbols.length), 'list-unordered'),
      createStatusItem('Last Stock Refresh', formatTimestamp(stockState.updatedAt), 'history'),
      createCommandItem('Refresh Stocks Now', 'refresh', 'finbox.stock.refresh'),
      createCommandItem('Open FinBox Settings', 'settings-gear', 'finbox.settings.open')
    ];
  }

  dispose(): void {
    this.storeListener.dispose();
    this.onDidChangeTreeDataEmitter.dispose();
  }
}

function createSettingItem(label: string, description: string, icon: string, settingId: string): vscode.TreeItem {
  const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);
  item.description = description;
  item.tooltip = `${label}: ${description}`;
  item.iconPath = new vscode.ThemeIcon(icon);
  item.command = {
    command: 'finbox.settings.open',
    title: 'Open Setting',
    arguments: [settingId]
  };
  return item;
}

function createStatusItem(label: string, description: string, icon: string): vscode.TreeItem {
  const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);
  item.description = description;
  item.tooltip = `${label}: ${description}`;
  item.iconPath = new vscode.ThemeIcon(icon);
  return item;
}

function createCommandItem(label: string, icon: string, command: string): vscode.TreeItem {
  const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);
  item.iconPath = new vscode.ThemeIcon(icon);
  item.command = { command, title: label };
  return item;
}

function formatTradingWindowStatus(date: Date): string {
  return isAshareTradingWindow(date) ? 'Active' : 'Closed';
}

function isAshareTradingWindow(date: Date): boolean {
  const day = date.getDay();
  if (day === 0 || day === 6) return false;

  const minutes = date.getHours() * 60 + date.getMinutes();
  return (minutes >= 9 * 60 + 25 && minutes <= 11 * 60 + 35)
    || (minutes >= 12 * 60 + 55 && minutes <= 15 * 60 + 5);
}

function formatTimestamp(value: string): string {
  if (!value) return 'Never';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN', { hour12: false });
}
