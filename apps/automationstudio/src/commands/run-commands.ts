import * as vscode from 'vscode';
import { ExecutionManager } from '@automation-studio/runtime';
import type { IEventBus, ILogger, IServiceProvider } from '@automation-studio/types';
import { TYPES } from '../di/types';
import type { FlowBuilderWebview } from '../workbench/flow-builder-webview';

export function registerRunCommands(context: vscode.ExtensionContext, provider: IServiceProvider) {
  context.subscriptions.push(
    vscode.commands.registerCommand('automationStudio.runScenario', async (node: any) => {
      let targetPath: string;

      if (node && node.resourceUri) {
        targetPath = node.resourceUri.fsPath;
      } else if (vscode.window.activeTextEditor && vscode.window.activeTextEditor.document.uri.fsPath.endsWith('.scenario.json')) {
        targetPath = vscode.window.activeTextEditor.document.uri.fsPath;
      } else {
        vscode.window.showErrorMessage('No scenario selected to run. Please click a scenario file in the Project Explorer or open a scenario editor.');
        return;
      }

      const executionManager = provider.resolve<ExecutionManager>(TYPES.ExecutionManager);

      vscode.window.showInformationMessage(`Starting scenario: ${targetPath}`);

      try {
        if (targetPath.endsWith('.scenario.json')) {
          const fs = require('fs') as typeof import('fs');
          const source = JSON.parse(fs.readFileSync(targetPath, 'utf8')) as { mode?: string };
          if (source.mode === 'playwright' || !source.mode) {
            const flowBuilder = provider.resolve<FlowBuilderWebview>(TYPES.FlowBuilderWebview);
            await flowBuilder.runScenarioFile(targetPath);
            return;
          }
        }
        const executionId = await executionManager.runScenario(targetPath);
        // We don't await the completion of the job here, as the execution manager handles it asynchronously
        // The UI will update based on events
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to start scenario: ${(error as Error).message}`);
      }
    }),
    vscode.commands.registerCommand('automationStudio.debugScenario', async (node: any) => {
      let targetPath: string;

      if (node && node.resourceUri) {
        targetPath = node.resourceUri.fsPath;
      } else if (vscode.window.activeTextEditor && vscode.window.activeTextEditor.document.uri.fsPath.endsWith('.scenario.json')) {
        targetPath = vscode.window.activeTextEditor.document.uri.fsPath;
      } else {
        vscode.window.showErrorMessage('No scenario selected to debug. Please click a scenario file in the Project Explorer or open a scenario editor.');
        return;
      }

      const executionManager = provider.resolve<ExecutionManager>(TYPES.ExecutionManager);

      vscode.window.showInformationMessage(`Starting scenario in debug mode: ${targetPath}`);

      try {
        const executionId = await executionManager.runScenario(targetPath, { debug: true });
        
        // Robust port polling helper
        const net = require('net') as typeof import('net');
        const pollPort = (port: number, host: string, timeoutMs: number): Promise<boolean> => {
          return new Promise((resolve) => {
            const start = Date.now();
            const check = () => {
              const socket = net.connect(port, host);
              socket.on('connect', () => {
                socket.destroy();
                resolve(true);
              });
              socket.on('error', () => {
                socket.destroy();
                if (Date.now() - start > timeoutMs) {
                  resolve(false);
                } else {
                  setTimeout(check, 100);
                }
              });
            };
            check();
          });
        };

        const portOpen = await pollPort(5678, 'localhost', 5000);
        if (portOpen) {
          const success = await vscode.debug.startDebugging(undefined, {
            type: 'python',
            request: 'attach',
            name: 'Attach (Automation Studio)',
            port: 5678,
            host: 'localhost'
          });
          if (!success) {
            vscode.window.showErrorMessage('Failed to attach Python debugger. Ensure the Python extension is installed and debugpy is available.');
          }
        } else {
          vscode.window.showErrorMessage('Python debugger attach timed out (port 5678 did not open).');
        }
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to start scenario: ${(error as Error).message}`);
      }
    }),
    vscode.commands.registerCommand('automationStudio.stopExecution', (executionId?: string) => {
      const executionManager = provider.resolve<ExecutionManager>(TYPES.ExecutionManager);
      if (executionId) {
        executionManager.abortExecution(executionId);
        vscode.window.showInformationMessage('Requested execution abort.');
      } else {
        // Find first running job
        const runningJob = executionManager.getJobs().find(j => j.status === 'running');
        if (runningJob) {
          executionManager.abortExecution(runningJob.id);
          vscode.window.showInformationMessage('Requested execution abort.');
        } else {
          vscode.window.showInformationMessage('No active execution to stop.');
        }
      }
    })
  );
}
