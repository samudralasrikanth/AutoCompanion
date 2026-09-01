import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import type { ILogger, IEventBus } from '@automation-studio/types';
import type { ProjectService } from '../services/project/project-service';
import type { ITreeNode, ITreeNodeRegistry } from './workbench-types';
import { ProjectEvents } from '@automation-studio/events';
import type { IIconRegistry } from './workbench-types';

export class WorkspaceExplorerProvider implements vscode.TreeDataProvider<ITreeNode> {
  private _onDidChangeTreeData: vscode.EventEmitter<ITreeNode | undefined | void> = new vscode.EventEmitter<ITreeNode | undefined | void>();
  readonly onDidChangeTreeData: vscode.Event<ITreeNode | undefined | void> = this._onDidChangeTreeData.event;

  constructor(
    private readonly projectService: ProjectService,
    private readonly treeNodeRegistry: ITreeNodeRegistry,
    private readonly iconRegistry: IIconRegistry,
    private readonly eventBus: IEventBus,
    private readonly logger: ILogger
  ) {
    this.eventBus.subscribe(ProjectEvents.ProjectOpened, () => this.refresh());
    this.eventBus.subscribe(ProjectEvents.ProjectClosed, () => this.refresh());
    this.eventBus.subscribe(ProjectEvents.ProjectCreated as any, () => this.refresh());
    this.treeNodeRegistry.onDidChangeTreeData(() => this.refresh());

    const watcher = vscode.workspace.createFileSystemWatcher('**/project.json');
    watcher.onDidCreate(() => this.refresh());
    watcher.onDidDelete(() => this.refresh());
  }

  public refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  public getTreeItem(element: ITreeNode): vscode.TreeItem {
    const item = new vscode.TreeItem(element.label, element.collapsibleState ?? vscode.TreeItemCollapsibleState.None);
    item.description = element.description;
    item.resourceUri = element.resourceUri;
    item.command = element.command;
    item.contextValue = element.contextValue;
    
    if (element.iconId) {
      item.iconPath = this.iconRegistry.getIcon(element.iconId);
    }
    
    // Default open behavior for files
    if (!item.command && element.collapsibleState === vscode.TreeItemCollapsibleState.None && element.resourceUri) {
      item.command = {
        command: 'vscode.open',
        title: 'Open File',
        arguments: [element.resourceUri],
      };
    }
    
    return item;
  }

  private async readDirectory(dirPath: string): Promise<ITreeNode[]> {
    const items: ITreeNode[] = [];
    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name.startsWith('.')) continue; // skip hidden
        if (entry.name === 'node_modules') continue;
        
        const fullPath = path.join(dirPath, entry.name);
        const isDir = entry.isDirectory();
        
        // If it's a project directory, maybe we want a command to open it?
        // But the user just wants to see files. We'll let them browse.
        const isProject = isDir && fs.existsSync(path.join(fullPath, 'project.json'));
        
        items.push({
          id: fullPath,
          label: entry.name,
          iconId: isProject ? 'folder-active' : (isDir ? 'folder' : 'file'),
          description: isProject ? 'Automation Project' : undefined,
          collapsibleState: isDir ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None,
          resourceUri: vscode.Uri.file(fullPath),
          contextValue: isProject ? 'project' : (isDir ? 'folder' : 'file'),
          command: isProject ? {
            command: 'automationStudio.project.open',
            title: 'Open Project',
            arguments: [fullPath]
          } : undefined
        });
      }
      
      items.sort((a, b) => {
        if (a.contextValue === b.contextValue) return a.label.localeCompare(b.label);
        return a.contextValue === 'folder' ? -1 : 1;
      });
    } catch (e) {
      this.logger.error('Failed to read directory', e as Error);
    }
    return items;
  }

  public async getChildren(element?: ITreeNode): Promise<ITreeNode[]> {
    const currentProject = this.projectService.manager.getCurrentProject();
    
    if (!currentProject) {
      if (element) {
        return element.getChildren ? element.getChildren() : (element.contextValue === 'folder' && element.resourceUri
          ? this.readDirectory(element.resourceUri.fsPath)
          : []);
      }
      
      // The extension source folder is not the user's Automation Studio
      // workspace. Providers remain the single source of truth for the project
      // tree even before a project has been opened.
      return this.treeNodeRegistry.getProviders().flatMap((provider) => provider.rootNodes);
    }

    if (element) {
      return element.getChildren ? element.getChildren() : [];
    }

    // Root level: query all registered providers
    const providers = this.treeNodeRegistry.getProviders();
    const rootNodes: ITreeNode[] = [];
    
    for (const provider of providers) {
      rootNodes.push(...provider.rootNodes);
    }
    
    return rootNodes;
  }
}
