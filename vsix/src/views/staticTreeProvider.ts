import * as vscode from 'vscode';

export class StaticTreeProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  constructor(
    private readonly message: string,
    private readonly icon = 'info'
  ) {}

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(): vscode.TreeItem[] {
    const item = new vscode.TreeItem(this.message, vscode.TreeItemCollapsibleState.None);
    item.iconPath = new vscode.ThemeIcon(this.icon);
    return [item];
  }
}
