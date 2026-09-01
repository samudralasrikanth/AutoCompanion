import * as vscode from 'vscode';
import { UnifiedFileSystemObjectRepository } from '@automation-studio/sdk';

export class UnifiedObjectTreeProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private readonly change = new vscode.EventEmitter<void>();
  public readonly onDidChangeTreeData = this.change.event;

  constructor(private readonly projectPathProvider: () => string | undefined) {}

  public refresh(): void { this.change.fire(); }

  public getTreeItem(element: vscode.TreeItem): vscode.TreeItem { return element; }

  public async getChildren(): Promise<vscode.TreeItem[]> {
    const items: vscode.TreeItem[] = [];
    const projectPath = this.projectPathProvider();
    if (!projectPath) return items;
    const repository = new UnifiedFileSystemObjectRepository(projectPath);
    for (const uri of await repository.list()) {
      const object = await repository.getObject(uri);
      const item = new vscode.TreeItem(uri.replace('object://', ''), vscode.TreeItemCollapsibleState.None);
      item.description = object ? `${object.type} · v${object.version}` : 'missing';
      item.tooltip = object?.description || uri;
      item.iconPath = new vscode.ThemeIcon('symbol-object');
      items.push(item);
    }
    return items;
  }
}
