import * as vscode from 'vscode';
import type { IEnvironmentService } from './workbench-types';

export interface HealthStatus {
  name: string;
  status: 'online' | 'degraded' | 'offline';
  description?: string;
}

export class HealthTreeDataProvider implements vscode.TreeDataProvider<HealthItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<HealthItem | undefined | void> =
    new vscode.EventEmitter<HealthItem | undefined | void>();
  readonly onDidChangeTreeData: vscode.Event<HealthItem | undefined | void> =
    this._onDidChangeTreeData.event;

  constructor(
    private readonly logger: any,
    private readonly environmentService?: IEnvironmentService
  ) {
    // Refresh the tree whenever environment status changes
    if (environmentService) {
      environmentService.onStatusChanged(() => this.refresh());
    }
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: HealthItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: HealthItem): Thenable<HealthItem[]> {
    if (element) {
      return Promise.resolve([]);
    }

    const status = this.environmentService?.status;

    const online = (label: string) =>
      new HealthItem(label, 'online', 'check', 'testing.iconPassed');
    const degraded = (label: string) =>
      new HealthItem(label, 'degraded', 'warning', 'problemsWarningIcon.foreground');
    const offline = (label: string) =>
      new HealthItem(label, 'offline', 'error', 'problemsErrorIcon.foreground');

    const resolve = (ready: boolean | undefined, label: string, isWarningWhenOff = false) => {
      if (ready) return online(label);
      return isWarningWhenOff ? degraded(label) : offline(label);
    };

    const items: HealthItem[] = [
      resolve(status?.python, 'Python Interpreter'),
      resolve(status?.node, 'Node.js Environment'),
      resolve(status?.git, 'Git VCS'),
      resolve(status?.playwright, 'Playwright Engine', true),
      resolve(status?.bitwarden, 'Bitwarden CLI', true),
      resolve(status?.ai, 'AI Provider', true),
      resolve(status?.ocr, 'OCR Engine'),
    ];

    return Promise.resolve(items);
  }
}

class HealthItem extends vscode.TreeItem {
  constructor(
    public readonly itemLabel: string,
    public readonly status: string,
    public readonly icon: string,
    public readonly colorCode: string
  ) {
    super(itemLabel, vscode.TreeItemCollapsibleState.None);
    this.description = status;

    // Using standard VS Code icons and colors to emulate the design's intent
    this.iconPath = new vscode.ThemeIcon(icon, new vscode.ThemeColor(colorCode));
  }
}
