import * as vscode from 'vscode';
import type { ILogger } from '@automation-studio/types';
import type { INotificationService } from './workbench-types';

export class NotificationService implements INotificationService {
  constructor(private readonly logger: ILogger) {}

  public async info(message: string, ...items: string[]): Promise<string | undefined> {
    this.logger.info(message);
    return vscode.window.showInformationMessage(message, ...items);
  }

  public async warn(message: string, ...items: string[]): Promise<string | undefined> {
    this.logger.warn(message);
    return vscode.window.showWarningMessage(message, ...items);
  }

  public async error(message: string, ...items: string[]): Promise<string | undefined> {
    this.logger.error(message);
    return vscode.window.showErrorMessage(message, ...items);
  }

  public async withProgress<R>(
    title: string,
    task: (
      progress: { report(value: { message?: string; increment?: number }): void },
      token: vscode.CancellationToken
    ) => Promise<R>
  ): Promise<R> {
    return vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title,
        cancellable: true,
      },
      task
    );
  }
}
