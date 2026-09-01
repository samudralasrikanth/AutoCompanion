import * as vscode from 'vscode';
import { exec } from 'child_process';
import { promisify } from 'util';
import type { IServiceProvider, ICommandDescriptor, ILogger } from '@automation-studio/types';
import { TYPES } from '../di/types';

const execAsync = promisify(exec);

async function checkCommand(cmd: string, name: string): Promise<string> {
  try {
    const { stdout } = await execAsync(cmd);
    return `✅ ${name}: ${stdout.trim().split('\n')[0]}`;
  } catch (error) {
    return `❌ ${name}: Not installed or not in PATH`;
  }
}

export function createDoctorCommands(provider: IServiceProvider, outputChannel: vscode.OutputChannel): ReadonlyArray<ICommandDescriptor> {
  return [
    {
      id: 'automationStudio.doctor',
      title: 'Run Runtime Doctor',
      category: 'Automation Studio',
      telemetry: true,
      handler: async (): Promise<void> => {
        const logger = provider.resolve<ILogger>(TYPES.Logger);
        
        outputChannel.show(true);
        outputChannel.appendLine('=========================================');
        outputChannel.appendLine(' Automation Studio: Runtime Doctor');
        outputChannel.appendLine('=========================================');
        outputChannel.appendLine('Checking system environment...\\n');

        vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: 'Running Diagnostics...',
            cancellable: false
          },
          async (progress) => {
            const checks = [
              { cmd: 'node -v', name: 'Node.js' },
              { cmd: 'python3 --version', name: 'Python 3' },
              { cmd: 'java -version 2>&1', name: 'Java' },
              { cmd: 'dotnet --version', name: '.NET Core' },
              { cmd: 'git --version', name: 'Git' },
              { cmd: 'uv --version', name: 'uv (Python Package Manager)' },
              { cmd: 'pip3 --version', name: 'pip3' },
              { cmd: 'npx playwright --version', name: 'Playwright' }
            ];

            for (const check of checks) {
              const result = await checkCommand(check.cmd, check.name);
              outputChannel.appendLine(result);
              logger.info(`[Doctor] ${result}`);
            }
            
            outputChannel.appendLine('\nChecking environment variables...');
            
            const envVars = ['JAVA_HOME', 'PYTHONPATH', 'PATH'];
            for (const envVar of envVars) {
              if (process.env[envVar]) {
                outputChannel.appendLine(`✅ ${envVar} is set`);
              } else {
                outputChannel.appendLine(`⚠️ ${envVar} is NOT set`);
              }
            }

            outputChannel.appendLine('\n=========================================');
            outputChannel.appendLine(' Diagnostics Complete');
            outputChannel.appendLine('=========================================');
            
            vscode.window.showInformationMessage('Runtime Doctor diagnostics completed. Check output channel for details.');
          }
        );
      }
    }
  ];
}
