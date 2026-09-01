import * as vscode from 'vscode';
import type { IDisposable } from '@automation-studio/types';

export interface INotificationService {
  info(message: string, ...items: string[]): Promise<string | undefined>;
  warn(message: string, ...items: string[]): Promise<string | undefined>;
  error(message: string, ...items: string[]): Promise<string | undefined>;
  withProgress<R>(
    title: string,
    task: (
      progress: { report(value: { message?: string; increment?: number }): void },
      token: vscode.CancellationToken
    ) => Promise<R>
  ): Promise<R>;
}

export interface IIconRegistry {
  getIcon(id: string): vscode.ThemeIcon;
  registerIcon(id: string, codiconId: string, color?: string): void;
}

export interface IContextKeyService {
  setContext(key: string, value: any): Promise<void>;
  getContext<T>(key: string): T | undefined;
}

export type ThemeType = 'light' | 'dark' | 'hc' | 'enterprise';

export interface IThemeService {
  readonly currentTheme: ThemeType;
  onChange(listener: (theme: ThemeType) => void): IDisposable;
}

export interface EnvironmentStatus {
  python: boolean;
  node: boolean;
  git: boolean;
  playwright: boolean;
  bitwarden: boolean;
  ai: boolean;
  ocr: boolean;
}

export interface IEnvironmentService {
  readonly status: EnvironmentStatus;
  checkAll(): Promise<void>;
  onStatusChanged(listener: (status: EnvironmentStatus) => void): IDisposable;
}

export interface IWorkbenchStatusService {
  registerStatusItem(id: string, alignment: 'left' | 'right', priority: number): vscode.StatusBarItem;
  updateStatus(id: string, text: string, tooltip?: string): void;
  removeStatus(id: string): void;
}

export interface ITreeNode {
  readonly id: string;
  readonly label: string;
  readonly description?: string;
  readonly iconId?: string;
  readonly collapsibleState?: vscode.TreeItemCollapsibleState;
  readonly command?: vscode.Command;
  readonly resourceUri?: vscode.Uri;
  readonly contextValue?: string;
  getChildren?(): Promise<ITreeNode[]>;
}

export interface ITreeNodeProvider {
  readonly providerId: string;
  readonly rootNodes: ITreeNode[];
}

export interface ITreeNodeRegistry {
  registerProvider(provider: ITreeNodeProvider): IDisposable;
  getProviders(): ITreeNodeProvider[];
  onDidChangeTreeData(listener: () => void): IDisposable;
  fireTreeDataChanged(): void;
}

export interface ICardProvider {
  readonly cardId: string;
  readonly priority: number;
  renderHTML(): string;
}

export interface ICardRegistry {
  registerCard(card: ICardProvider): IDisposable;
  getCards(): ICardProvider[];
}

export interface IQuickAction {
  readonly id: string;
  readonly label: string;
  readonly iconId: string;
  readonly command: string;
}

export interface IQuickActionRegistry {
  registerAction(action: IQuickAction): IDisposable;
  getActions(): IQuickAction[];
}

export interface IWebviewOptions {
  id: string;
  title: string;
  viewColumn?: vscode.ViewColumn;
  preserveFocus?: boolean;
  localResourceRoots?: vscode.Uri[];
  enableScripts?: boolean;
}

export interface IWebviewPanel extends IDisposable {
  readonly id: string;
  readonly panel: vscode.WebviewPanel;
  updateHtml(html: string): void;
  onDidDispose(listener: () => void): IDisposable;
  onDidReceiveMessage(listener: (message: any) => void): IDisposable;
  postMessage(message: any): Promise<boolean>;
  reveal(viewColumn?: vscode.ViewColumn): void;
}

export interface IWebviewHost {
  createOrShow(options: IWebviewOptions): IWebviewPanel;
  getPanel(id: string): IWebviewPanel | undefined;
  disposeAll(): void;
}
