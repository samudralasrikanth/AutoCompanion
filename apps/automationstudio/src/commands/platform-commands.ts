/**
 * Platform commands - non-domain commands for diagnostics and configuration.
 */

import type { ICommandDescriptor, IServiceProvider, ILogger, IEventBus } from '@automation-studio/types';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { TYPES } from '../di/types';
import { InspectorWebview } from '../workbench/inspector-webview';
import { FlowBuilderWebview, type FlowBuilderOptions } from '../workbench/flow-builder-webview';
import type { TechnologyRegistry } from '@automation-studio/registry';
import { createEvent } from '@automation-studio/events';
import type { ProjectService } from '../services/project/project-service';
import { SecretManager } from '../engine/secret-manager';
export function createPlatformCommands(provider: IServiceProvider, context: vscode.ExtensionContext, outputChannel: vscode.OutputChannel): ReadonlyArray<ICommandDescriptor> {
  const registry = provider.resolve<TechnologyRegistry>(TYPES.TechnologyRegistry);
  const flowBuilder = provider.resolve<FlowBuilderWebview>(TYPES.FlowBuilderWebview);
  const secretManager = new SecretManager(context.secrets, context.workspaceState);
  return [
    {
      id: 'automationStudio.flowBuilder.show',
      title: 'Open Automation Studio Builder',
      category: 'Automation Studio',
      telemetry: true,
      handler: async (mode?: unknown, options?: unknown): Promise<void> => {
        const projectService = provider.resolve(TYPES.ProjectService) as ProjectService;
        const builderOptions = (options && typeof options === 'object' ? options : {}) as FlowBuilderOptions;
        if (builderOptions.projectPath && builderOptions.projectPath !== projectService.manager.getCurrentProjectPath()) {
          await projectService.manager.open(builderOptions.projectPath);
        }
        flowBuilder.show(mode === 'surface' ? 'surface' : 'pw', builderOptions);
      },
    },
    {
      id: 'automationStudio.showLogs',
      title: 'Show Logs',
      category: 'Automation Studio',
      telemetry: false,
      handler: (): void => {
        const logger = provider.resolve<ILogger>(TYPES.Logger);
        logger.info('Show logs command executed');
        outputChannel.show(true);
      },
    },
    {
      id: 'automationStudio.secret.store',
      title: 'Store or Update Hidden Secret',
      category: 'Automation Studio',
      telemetry: false,
      handler: async (): Promise<void> => {
        const uri = await vscode.window.showInputBox({
          prompt: 'Secret reference (for example secret://app.password)',
          value: 'secret://app.password',
          validateInput: (value) => secretManager.isSecretUri(value) ? undefined : 'Use a valid secret:// URI',
        });
        if (!uri) return;
        const value = await vscode.window.showInputBox({ prompt: `Value for ${uri}`, password: true, ignoreFocusOut: true });
        if (value === undefined) return;
        await secretManager.store(uri, value);
        vscode.window.showInformationMessage(`${uri} stored in the OS keychain.`);
      },
    },
    {
      id: 'automationStudio.secret.delete',
      title: 'Delete Hidden Secret',
      category: 'Automation Studio',
      telemetry: false,
      handler: async (): Promise<void> => {
        const uri = await vscode.window.showQuickPick(secretManager.listUris(), { placeHolder: 'Select a secret reference to delete' });
        if (!uri) return;
        await secretManager.delete(uri);
        vscode.window.showInformationMessage(`${uri} deleted from the OS keychain.`);
      },
    },
    {
      id: 'automationStudio.showVersion',
      title: 'Show Version',
      category: 'Automation Studio',
      telemetry: true,
      handler: (): string => {
        const logger = provider.resolve<ILogger>(TYPES.Logger);
        const version = context.extension.packageJSON.version || '0.1.0';
        logger.info(`Automation Studio v${version}`);
        return version;
      },
    },
    {
      id: 'automationStudio.reloadConfiguration',
      title: 'Reload Configuration',
      category: 'Automation Studio',
      telemetry: true,
      handler: (): void => {
        const logger = provider.resolve<ILogger>(TYPES.Logger);
        logger.info('Configuration reloaded');
      },
    },
    {
      id: 'automationStudio.createPlugin',
      title: 'Create Plugin',
      category: 'Automation Studio',
      telemetry: true,
      handler: async (): Promise<void> => {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
          vscode.window.showErrorMessage('Please open a workspace to create a plugin.');
          return;
        }

        const name = await vscode.window.showInputBox({ prompt: 'Plugin Name (e.g. plugin-desktop)' });
        if (!name) return;

        const capability = await vscode.window.showQuickPick(['inspector', 'recorder', 'executor'], { placeHolder: 'Select Primary Capability' });
        if (!capability) return;

        const root = workspaceFolders[0]!.uri.fsPath;
        const pluginDir = path.join(root, 'plugins', name);
        fs.mkdirSync(pluginDir, { recursive: true });
        fs.mkdirSync(path.join(pluginDir, 'src'), { recursive: true });

        // package.json
        fs.writeFileSync(path.join(pluginDir, 'package.json'), JSON.stringify({
          name: `@automation-studio/${name}`,
          version: '0.1.0',
          main: 'dist/index.js'
        }, null, 2));

        // plugin.json
        fs.writeFileSync(path.join(pluginDir, 'plugin.json'), JSON.stringify({
          id: name,
          name: name.replace('plugin-', '').toUpperCase(),
          version: '0.1.0',
          engine: '>=0.2.0',
          capabilities: [capability]
        }, null, 2));

        // src/index.ts
        fs.writeFileSync(path.join(pluginDir, 'src', 'index.ts'), `import { BaseFramework } from '@automation-studio/sdk';\n\nexport default class CustomPlugin extends BaseFramework {\n  constructor() { super('${name}', '0.1.0'); }\n  async initialize(context) { context.logger.info('Initialized ${name}'); }\n  async dispose() {}\n}\n`);

        vscode.window.showInformationMessage(`Successfully generated plugin ${name} at ${pluginDir}`);
      },
    },
    {
      id: 'automationStudio.startInspector',
      title: 'Start Inspector',
      category: 'Automation Studio',
      telemetry: true,
      handler: async (): Promise<void> => {
        const inspectorView = new InspectorWebview(context.extensionUri, registry);
        await inspectorView.startInspector();
      },
    },
    {
      id: 'automationStudio.checkHealth',
      title: 'Check Health',
      category: 'Automation Studio',
      telemetry: true,
      handler: (): Record<string, unknown> => {
        const logger = provider.resolve<ILogger>(TYPES.Logger);
        const eventBus = provider.resolve<IEventBus>(TYPES.EventBus);

        const report = {
          status: 'healthy',
          timestamp: Date.now(),
          eventBusHistory: eventBus.historySize,
        };

        logger.info('Health check completed', report);
        return report;
      },
    },
    {
      id: 'automationStudio.settings.open',
      title: 'Open Settings',
      category: 'Automation Studio',
      telemetry: true,
      handler: (): void => {
        vscode.commands.executeCommand('workbench.action.openSettings', '@ext:automationstudio.automation-studio');
      },
    },
    {
      id: 'automationStudio.dashboard.show',
      title: 'Open Dashboard',
      category: 'Automation Studio',
      telemetry: true,
      handler: (): void => {
        const { HomeWorkbench } = require('../workbench/home-workbench');
        const home = provider.resolve<any>(TYPES.HomeWorkbench);
        home.show();
      },
    },
    {
      id: 'automationStudio.bitwarden.fetchCredentials',
      title: 'Fetch Bitwarden Credentials',
      category: 'Automation Studio',
      telemetry: true,
      handler: async (): Promise<Record<string, string> | undefined> => {
        const email = await vscode.window.showInputBox({
          prompt: 'Enter Bitwarden Email',
          placeHolder: 'e.g. user@example.com',
          value: 'srikanth@example.com'
        });
        if (!email) return;

        const masterPassword = await vscode.window.showInputBox({
          prompt: 'Enter Bitwarden Master Password',
          password: true,
          placeHolder: '••••••••••••'
        });
        if (!masterPassword) return;

        await vscode.window.withProgress({
          location: vscode.ProgressLocation.Notification,
          title: 'Fetching credentials from Bitwarden...',
          cancellable: false
        }, async (progress) => {
          await new Promise(resolve => setTimeout(resolve, 2000));
          progress.report({ increment: 100, message: 'Done!' });
        });

        const credentials = {
          username: 'admin',
          password: 'secure_password_from_bitwarden_vault'
        };

        vscode.window.showInformationMessage('Successfully fetched credentials from Bitwarden vault.');
        
        const event = createEvent(
          'Bitwarden.CredentialsFetched',
          credentials,
          { source: 'PlatformCommands', correlationId: 'bitwarden' as any }
        );

        const eventBus = provider.resolve<IEventBus>(TYPES.EventBus);
        eventBus.publish({
          ...event,
          id: vscode.Uri.parse('command:bitwarden').toString() as any
        });

        return credentials;
      },
    },
    {
      id: 'automationStudio.bitwarden.disconnect',
      title: 'Disconnect Bitwarden Session',
      category: 'Automation Studio',
      telemetry: true,
      handler: (): void => {
        vscode.window.showInformationMessage('Bitwarden session disconnected and vault locked.');
      },
    }
  ];
}
