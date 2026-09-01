import * as vscode from 'vscode';
import type { ILogger } from '@automation-studio/types';
import type { IWorkbenchStatusService } from './workbench-types';

export class WorkbenchStatusService implements IWorkbenchStatusService {
  private readonly items = new Map<string, vscode.StatusBarItem>();

  constructor(private readonly logger: ILogger) {}

  public registerStatusItem(id: string, alignment: 'left' | 'right', priority: number): vscode.StatusBarItem {
    if (this.items.has(id)) {
      this.logger.warn(`Disposing existing status item: ${id}`);
      this.items.get(id)?.dispose();
    }

    const vscodeAlignment = alignment === 'left' ? vscode.StatusBarAlignment.Left : vscode.StatusBarAlignment.Right;
    const item = vscode.window.createStatusBarItem(vscodeAlignment, priority);
    
    this.items.set(id, item);
    this.logger.debug(`Registered Status Item: ${id}`);
    
    return item;
  }

  public updateStatus(id: string, text: string, tooltip?: string, command?: string): void {
    const item = this.items.get(id);
    if (item) {
      item.text = text;
      if (tooltip !== undefined) {
        item.tooltip = tooltip;
      }
      if (command !== undefined) {
        item.command = command;
      }
      item.show();
    } else {
      this.logger.warn(`Attempted to update non-existent status item: ${id}`);
    }
  }

  public removeStatus(id: string): void {
    const item = this.items.get(id);
    if (item) {
      item.dispose();
      this.items.delete(id);
      this.logger.debug(`Removed Status Item: ${id}`);
    }
  }

  public disposeAll(): void {
    for (const item of this.items.values()) {
      item.dispose();
    }
    this.items.clear();
  }
}
