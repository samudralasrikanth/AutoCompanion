import * as vscode from 'vscode';
import type { IServiceProvider } from '@automation-studio/types';
import { TYPES } from '../di/types';
import { ReportWebview } from '../workbench/report-webview';

export function registerReportCommands(context: vscode.ExtensionContext, provider: IServiceProvider) {
  context.subscriptions.push(
    vscode.commands.registerCommand('automationStudio.showReport', (executionId?: string) => {
      // In a real app, we'd prompt for executionId if not provided, or fetch the latest
      const idToOpen = executionId || 'latest';
      const reportWebview = provider.resolve<ReportWebview>(TYPES.ReportWebview);
      reportWebview.show(idToOpen);
    })
  );
}
