import * as vscode from 'vscode';
import type { ITreeNodeProvider, ITreeNode } from './workbench-types';
import type { ProjectService } from '../services/project/project-service';
import * as fs from 'fs';
import * as path from 'path';
import { getDefaultAutomationWorkspacePath } from '../services/workspace/workspace-service';

/** Presents the small, useful project view while exposing the real files. */
export class LogicalNodesProvider implements ITreeNodeProvider {
  public readonly providerId = 'automationStudio.nodes.logical';

  constructor(private readonly projectService: ProjectService) {}

  public get rootNodes(): ITreeNode[] {
    const projects = new Map<string, { name: string; path: string }>();
    const currentPath = this.projectService.manager.getCurrentProjectPath();
    if (currentPath && fs.existsSync(path.join(currentPath, 'project.json'))) {
      projects.set(currentPath, { name: this.projectName(currentPath), path: currentPath });
    }

    // Projects belong to the user-owned Automation Studio workspace, not to the
    // extension source checkout. Keep every valid project visible so opening a
    // new project does not hide the projects created before it.
    const projectsRoot = path.join(getDefaultAutomationWorkspacePath(), 'projects');
    if (fs.existsSync(projectsRoot)) {
      for (const entry of fs.readdirSync(projectsRoot, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const projectPath = path.join(projectsRoot, entry.name);
        if (fs.existsSync(path.join(projectPath, 'project.json'))) {
          projects.set(projectPath, { name: this.projectName(projectPath), path: projectPath });
        }
      }
    }

    return [...projects.values()]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((project) => ({
        id: `project-root:${project.path}`,
        label: project.name,
        description: project.path === currentPath ? 'Current project' : 'Automation Project',
        collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
        iconId: project.path === currentPath ? 'folder-active' : 'project',
        contextValue: 'project',
        resourceUri: vscode.Uri.file(project.path),
        command: { command: 'automationStudio.project.open', title: 'Open Project', arguments: [project.path] },
        getChildren: async () => this.getLogicalNodes(project.path),
      }));
  }

  private projectName(projectPath: string): string {
    try {
      const manifest = JSON.parse(fs.readFileSync(path.join(projectPath, 'project.json'), 'utf8')) as { projectName?: string };
      return manifest.projectName || path.basename(projectPath);
    } catch {
      return path.basename(projectPath);
    }
  }

  private getLogicalNodes(projectPath: string): ITreeNode[] {
    const definitions = [
      ['node-scenarios', 'Scenarios', 'automation/scenarios', 'play', 'scenarioFolder'],
      ['node-selectors', 'Selectors', 'automation/selectors', 'symbol-class', 'folder'],
      ['node-keywords', 'Keywords', 'automation/keywords', 'symbol-method', 'folder'],
      ['node-test-data', 'Test Data', 'data/testdata', 'database', 'folder'],
      ['node-reports', 'Reports', '.automationstudio/reports', 'graph', 'reportFolder'],
      ['node-screenshots', 'Screenshots', 'artifacts/screenshots', 'device-camera', 'folder'],
      ['node-config', 'Config', 'config', 'settings-gear', 'folder'],
    ] as const;
    return definitions
      .map(([id, label, relativePath, iconId, contextValue]) => ({ id, label, relativePath, iconId, contextValue, fullPath: path.join(projectPath, relativePath) }))
      .filter(node => fs.existsSync(node.fullPath))
      .map(node => ({
        id: `${projectPath}:${node.id}`, label: node.label, iconId: node.iconId, contextValue: node.contextValue,
        resourceUri: vscode.Uri.file(node.fullPath), collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
        getChildren: async () => this.readDirectory(node.fullPath, node.contextValue === 'reportFolder' ? 'report' : 'file'),
      }));
  }

  private async readDirectory(dirPath: string, mode: 'file' | 'report'): Promise<ITreeNode[]> {
    let entries: fs.Dirent[];
    try { entries = await fs.promises.readdir(dirPath, { withFileTypes: true }); } catch { return []; }
    const nodes: ITreeNode[] = [];
    for (const entry of entries) {
      if (entry.name.startsWith('.') && entry.name !== '.gitkeep') continue;
      if (entry.name === 'node_modules') continue;
      const fullPath = path.join(dirPath, entry.name);
      const isDirectory = entry.isDirectory();
      nodes.push({
        id: fullPath, label: entry.name,
        iconId: isDirectory ? 'folder' : (entry.name.endsWith('.scenario.json') || entry.name.endsWith('.feature') || entry.name.endsWith('.ts') ? 'file-code' : 'file'),
        contextValue: isDirectory ? (mode === 'report' ? 'reportFolder' : 'folder') : (entry.name.endsWith('.scenario.json') ? 'scenario' : 'file'),
        resourceUri: vscode.Uri.file(fullPath),
        collapsibleState: isDirectory ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None,
        command: isDirectory ? undefined : { command: 'vscode.open', title: 'Open File', arguments: [vscode.Uri.file(fullPath)] },
        getChildren: isDirectory ? async () => this.readDirectory(fullPath, mode) : undefined,
      });
    }
    return nodes.sort((a, b) => {
      const aFolder = a.collapsibleState !== vscode.TreeItemCollapsibleState.None;
      const bFolder = b.collapsibleState !== vscode.TreeItemCollapsibleState.None;
      return aFolder === bFolder ? a.label.localeCompare(b.label) : (aFolder ? -1 : 1);
    });
  }
}
