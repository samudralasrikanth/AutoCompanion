import * as vscode from 'vscode';
import type { ILogger } from '@automation-studio/types';
import type { IContextKeyService } from './workbench-types';

export class ContextKeyService implements IContextKeyService {
  private readonly contextValues = new Map<string, any>();

  constructor(private readonly logger: ILogger) {}

  public async setContext(key: string, value: any): Promise<void> {
    this.contextValues.set(key, value);
    try {
      await vscode.commands.executeCommand('setContext', key, value);
      this.logger.debug(`Context key set: ${key} = ${String(value)}`);
    } catch (err) {
      this.logger.error(`Failed to set context key: ${key}`, err as Error);
    }
  }

  public getContext<T>(key: string): T | undefined {
    return this.contextValues.get(key) as T | undefined;
  }
}
