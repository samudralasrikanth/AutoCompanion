/**
 * Extension entry point.
 * activate() bootstraps the platform, deactivate() performs graceful shutdown.
 */

import * as vscode from 'vscode';
import type { IServiceProvider } from '@automation-studio/types';

import { TYPES } from './di/types';
import { bootstrap } from './bootstrap/bootstrapper';
import { RuntimeMonitorWebview } from './workbench/runtime-monitor-webview';
import { ScenarioEditorProvider } from './workbench/scenario-editor-provider';
import { shutdown } from './bootstrap/shutdown';
import { AutomationDebugConfigurationProvider, AutomationDebugAdapterDescriptorFactory } from './workbench/debugger/debug-configuration-provider';
import { ExecutionManager, RuntimeEngine } from '@automation-studio/runtime';
import { IRecorderRegistry } from '@automation-studio/recorder';
import * as path from 'node:path';
import { ensureAutomationWorkspace } from './services/workspace/workspace-service';
import { ObjectRepositoryWebviewProvider } from './workbench/object-repository-webview';
import { AutomationStudioCopilotAgents } from './agents/copilot-agents';
import * as fs from 'node:fs';
import { Module } from 'node:module';
import * as osPath from 'node:path';

let serviceProvider: IServiceProvider | undefined;

function configurePackagedDependencies(extensionPath: string): void {
  const runtimeDependencies = osPath.join(extensionPath, 'runtime-dependencies');
  const runtimeNodeModules = osPath.join(runtimeDependencies, 'node_modules');
  if (!fs.existsSync(runtimeNodeModules) && !fs.existsSync(runtimeDependencies)) return;

  const modulePaths = [runtimeNodeModules, runtimeDependencies].filter((candidate) => fs.existsSync(candidate));

  const existingNodePath = process.env['NODE_PATH'];
  process.env['NODE_PATH'] = existingNodePath
    ? `${modulePaths.join(osPath.delimiter)}${osPath.delimiter}${existingNodePath}`
    : modulePaths.join(osPath.delimiter);

  // NODE_PATH is read when Node initializes its global module paths. The
  // extension host is already running, so refresh those paths before any
  // external runtime dependency is loaded.
  (Module as unknown as { _initPaths: () => void })._initPaths();
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  configurePackagedDependencies(context.extensionPath);
  const automationWorkspacePath = ensureAutomationWorkspace();
  const result = await bootstrap(context);
  serviceProvider = result.provider;

  const currentRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const extensionRepoRoot = path.resolve(context.extensionPath, '..', '..');
  // VS Code can restore a terminal whose workspace folder was deleted between
  // sessions. Do not keep that stale folder as the Automation Studio home: it
  // produces a terminal launch failure before the user has opened a project.
  if (!currentRoot || !fs.existsSync(currentRoot) || currentRoot === extensionRepoRoot) {
    await vscode.commands.executeCommand(
      'vscode.openFolder',
      vscode.Uri.file(path.join(automationWorkspacePath, 'automationstudio.code-workspace')),
      false,
    );
  }

  // Register Vision Recorder Plugin (dynamic import to survive native binding failures)
  const registry = serviceProvider.resolve<IRecorderRegistry>(TYPES.RecorderRegistry);
  try {
    const { VisionRecorderPlugin } = require('@automation-studio/vision');
    registry.registerPlugin(new VisionRecorderPlugin());
  } catch (e) {
    console.warn('Could not load VisionRecorderPlugin:', e instanceof Error ? e.message : String(e));
  }

  // Register Playwright Recorder Plugin
  try {
    const { PlaywrightRecorderPlugin } = require('@automation-studio/playwright');
    registry.registerPlugin(new PlaywrightRecorderPlugin());
  } catch (e) {
    console.warn('Could not load PlaywrightRecorderPlugin:', e instanceof Error ? e.message : String(e));
  }

  activateViews(context, serviceProvider);
  const projectService = serviceProvider.resolve<any>(TYPES.ProjectService);
  new AutomationStudioCopilotAgents(projectService.manager).register(context);
  activateEditors(context);
  activateDebugger(context, serviceProvider);

  // Register provider disposal with extension lifecycle
  context.subscriptions.push({
    dispose: () => {
      if (serviceProvider) {
        void shutdown(serviceProvider);
        serviceProvider = undefined;
      }
    },
  });
}

function activateViews(context: vscode.ExtensionContext, provider: IServiceProvider): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('automationStudio.runtimeMonitor.show', () => {
      const monitor = provider.resolve<RuntimeMonitorWebview>(TYPES.RuntimeMonitorWebview);
      monitor.show();
    })
  );

  const rootPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const projectService = provider.resolve<any>(TYPES.ProjectService);
  if (rootPath) {
    const repoProvider = new ObjectRepositoryWebviewProvider(() => projectService.manager.getCurrentProjectPath?.() || rootPath);
    context.subscriptions.push(
      vscode.window.registerWebviewViewProvider(ObjectRepositoryWebviewProvider.viewType, repoProvider, { webviewOptions: { retainContextWhenHidden: true } }),
      vscode.commands.registerCommand('automationStudio.objectRepository.refresh', () => repoProvider.refresh())
    );
  }
}

function activateEditors(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(
      ScenarioEditorProvider.viewType,
      new ScenarioEditorProvider(context.extensionUri),
      { webviewOptions: { retainContextWhenHidden: true } }
    )
  );
}

function activateDebugger(context: vscode.ExtensionContext, provider: IServiceProvider): void {
  const executionManager = provider.resolve<ExecutionManager>(TYPES.ExecutionManager);
  const engine = executionManager.engine;
  context.subscriptions.push(
    vscode.debug.registerDebugConfigurationProvider('automation-studio', new AutomationDebugConfigurationProvider())
  );
  context.subscriptions.push(
    vscode.debug.registerDebugAdapterDescriptorFactory('automation-studio', new AutomationDebugAdapterDescriptorFactory(engine))
  );
}

export async function deactivate(): Promise<void> {
  if (serviceProvider) {
    await shutdown(serviceProvider);
    serviceProvider = undefined;
  }
}
