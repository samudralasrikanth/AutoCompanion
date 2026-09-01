import * as vscode from 'vscode';
import type { ILogger } from '@automation-studio/types';
import type { IIconRegistry } from './workbench-types';

export class IconRegistry implements IIconRegistry {
  private readonly icons = new Map<string, vscode.ThemeIcon>();

  constructor(private readonly logger: ILogger) {
    // Register default system icons
    this.registerIcon('project', 'folder-library');
    this.registerIcon('scenario', 'file-code');
    this.registerIcon('report', 'graph');
    this.registerIcon('python', 'code');
    this.registerIcon('ai', 'hubot');
    this.registerIcon('settings', 'settings-gear');
    this.registerIcon('integration', 'plug');
  }

  public registerIcon(id: string, codiconId: string, color?: string): void {
    if (color) {
      this.icons.set(id, new vscode.ThemeIcon(codiconId, new vscode.ThemeColor(color)));
    } else {
      this.icons.set(id, new vscode.ThemeIcon(codiconId));
    }
    this.logger.debug(`Registered icon ${id} -> ${codiconId}`);
  }

  public getIcon(id: string): vscode.ThemeIcon {
    return this.icons.get(id) || new vscode.ThemeIcon('file');
  }
}
