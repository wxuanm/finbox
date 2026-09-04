import * as vscode from 'vscode';

export class SettingsTreeProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<vscode.TreeItem | undefined | null | void>();
  readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

  refresh(): void {
    this.onDidChangeTreeDataEmitter.fire();
  }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(): vscode.TreeItem[] {
    return [
      createCommandItem('Open Settings', 'settings-gear', 'finbox.settings.open'),
      createCommandItem('Export Config', 'cloud-download', 'finbox.config.export'),
      createCommandItem('Import Config', 'cloud-upload', 'finbox.config.import')
    ];
  }

  dispose(): void {
    this.onDidChangeTreeDataEmitter.dispose();
  }
}

function createCommandItem(label: string, icon: string, command: string): vscode.TreeItem {
  const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);
  item.tooltip = label;
  item.iconPath = new vscode.ThemeIcon(icon);
  item.command = { command, title: label };
  return item;
}
