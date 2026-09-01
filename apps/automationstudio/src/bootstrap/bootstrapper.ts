/**
 * Bootstrapper - orchestrates extension activation.
 *
 * Sequence:
 * 1. Create service collection
 * 2. Register all services
 * 3. Build service provider
 * 4. Initialize services (in dependency order)
 * 5. Register commands
 * 6. Emit ExtensionActivated
 */

import type * as vscode from 'vscode';
import type { IEventBus, ILogger, IServiceProvider } from '@automation-studio/types';
import { LogLevel } from '@automation-studio/types';
import { EventBus, createEvent, PlatformEvents, ProjectEvents, ExecutionEvents, type ExtensionActivatedPayload } from '@automation-studio/events';
import { Logger, ConsoleSink } from '@automation-studio/logger';
import { Stopwatch } from '@automation-studio/shared';
import { ServiceCollection } from '../di/service-collection';
import { ServiceProvider } from '../di/service-provider';
import { TYPES } from '../di/types';
import { ExecutionManager, ArtifactManager, ReportGenerator } from '@automation-studio/runtime';
import { TechnologyRegistry, FrameworkManager } from '@automation-studio/registry';
import { VSCodeOutputChannelSink } from '../logger/vscode-output-sink';
import { ConfigurationService } from '../configuration/configuration-service';
import { StateService } from '../state/state-service';
import { ProjectService } from '../services/project/project-service';
import { RuntimeMonitorWebview } from '../workbench/runtime-monitor-webview';
import { ExecutionNotifications } from '../workbench/execution-notifications';
import { ReportWebview } from '../workbench/report-webview';
import { FrameworkManagerWebview } from '../workbench/framework-manager-webview';
import { ConsoleWebviewViewProvider } from '../workbench/console-webview';
import { createProjectCommands } from '../commands/project-commands';
import { createPlatformCommands } from '../commands/platform-commands';
import { createRecorderCommands } from '../commands/recorder-commands';
import { createDoctorCommands } from '../commands/doctor-commands';
import { registerRunCommands } from '../commands/run-commands';
import { registerReportCommands } from '../commands/report-commands';
import { NotificationService } from '../workbench/notification-service';
import { EnvironmentService } from '../workbench/environment-service';
import { WebviewHost } from '../workbench/webview-host';
import { WorkbenchStatusService } from '../workbench/workbench-status-service';
import { IconRegistry } from '../workbench/icon-registry';
import { ThemeService } from '../workbench/theme-service';
import { ContextKeyService } from '../workbench/context-key-service';
import type { IContextKeyService } from '../workbench/workbench-types';
import { RecorderManager } from '../workbench/recorder-manager';
import { RecorderRegistry, IRecorderRegistry } from '@automation-studio/recorder';
import { TreeNodeRegistry } from '../workbench/tree-node-registry';
import { CardRegistry } from '../workbench/card-registry';
import { QuickActionRegistry } from '../workbench/quick-action-registry';
import { WorkspaceExplorerProvider } from '../workbench/workspace-explorer-provider';
import { LogicalNodesProvider } from '../workbench/logical-nodes-provider';
import { EnvironmentCard, RecentProjectsCard, LatestReportCard, NewsCard, CORE_QUICK_ACTIONS } from '../workbench/core-cards';
import { HomeWorkbench } from '../workbench/home-workbench';
import { FlowBuilderWebview } from '../workbench/flow-builder-webview';
import { HealthTreeDataProvider } from '../workbench/health-view';
import { CommandRegistry } from '../commands/command-registry';
import { PluginHost } from '../platform/plugin-host';
import { ActivationError } from '../errors/extension-error';

export interface BootstrapResult {
  readonly provider: IServiceProvider;
  readonly activationTime: number;
}

export async function bootstrap(context: vscode.ExtensionContext): Promise<BootstrapResult> {
  const stopwatch = new Stopwatch().start();

  try {
    // Phase 1: Create core services that don't need DI
    const vscodeModule = require('vscode') as typeof vscode;
    const outputChannel = vscodeModule.window.createOutputChannel('Automation Studio');
    const vscodeSink = new VSCodeOutputChannelSink(outputChannel);
    const consoleSink = new ConsoleSink();
    const rootLogger = new Logger('AutomationStudio', [consoleSink, vscodeSink], {
      level: LogLevel.Debug,
    });

    rootLogger.info('Bootstrapping Automation Studio...');
    stopwatch.lap('Phase 1: Core services created');

    // Phase 2: Create event bus
    const eventBus = new EventBus({ maxHistorySize: 200, enableReplay: true });
    stopwatch.lap('Phase 2: Event bus created');

    // Phase 3: Build service collection
    const collection = new ServiceCollection();

    // Register core services
    collection.addSingleton(TYPES.Logger, () => rootLogger);
    collection.addSingleton(TYPES.EventBus, () => eventBus);

    collection.addSingleton(TYPES.ConfigurationService, (provider) => {
      const vscodeModule = require('vscode') as typeof vscode;
      const logger = provider.resolve<ILogger>(TYPES.Logger);
      return new ConfigurationService(vscodeModule.workspace, eventBus, logger.child('Configuration'));
    });

    collection.addSingleton(TYPES.StateService, (provider) => {
      const logger = provider.resolve<ILogger>(TYPES.Logger);
      return new StateService(
        context.workspaceState,
        context.globalState,
        context.secrets,
        logger.child('State'),
      );
    });

    // Phase 4: Register Domain Services
    const projectService = new ProjectService(eventBus, rootLogger.child('Project'), context.globalState);
    collection.addSingleton(TYPES.ProjectService, () => projectService);

    const technologyRegistry = new TechnologyRegistry();
    collection.addSingleton(TYPES.TechnologyRegistry, () => technologyRegistry);

    // Register Vision Plugin
    // We require it dynamically to avoid hard dependency at top-level
    try {
      const { default: VisionPlugin } = require('@automation-studio/vision');
      technologyRegistry.register({
        id: 'vision',
        name: 'Vision',
        version: '0.1.0',
        capabilities: ['inspector', 'recorder', 'executor'],
        createFramework: () => new VisionPlugin()
      });
      rootLogger.info('Registered VisionPlugin adapter');
    } catch (e) {
      rootLogger.warn('Could not load VisionPlugin adapter', { error: e instanceof Error ? e.message : String(e) });
    }
    try {
      const { default: PlaywrightPlugin } = require('@automation-studio/playwright');
      technologyRegistry.register({
        id: 'playwright',
        name: 'Playwright',
        version: '0.1.0',
        capabilities: ['inspector', 'recorder', 'executor'],
        createFramework: () => new PlaywrightPlugin()
      });
      rootLogger.info('Registered PlaywrightPlugin adapter');
    } catch (e) {
      rootLogger.warn('Could not load PlaywrightPlugin adapter', { error: e instanceof Error ? e.message : String(e) });
    }

    const frameworkManager = new FrameworkManager(technologyRegistry);
    collection.addSingleton(TYPES.FrameworkManager, () => frameworkManager);
    
    const recorderRegistry = new RecorderRegistry();
    collection.addSingleton(TYPES.RecorderRegistry, () => recorderRegistry);

    collection.addSingleton(TYPES.RecorderManager, (provider) => {
      const registry = provider.resolve<IRecorderRegistry>(TYPES.RecorderRegistry);
      const bus = provider.resolve<IEventBus>(TYPES.EventBus);
      const contextKey = provider.resolve<IContextKeyService>(TYPES.ContextKeyService);
      const logger = provider.resolve<ILogger>(TYPES.Logger);
      return new RecorderManager(registry, bus, contextKey, logger.child('RecorderManager'), provider);
    });

    const executionManager = new ExecutionManager(eventBus, rootLogger.child('ExecutionManager'));
    collection.addSingleton(TYPES.ExecutionManager, () => executionManager);

    // Phase 5: Register Workbench Infrastructure
    const notificationService = new NotificationService(rootLogger.child('NotificationService'));
    collection.addSingleton(TYPES.NotificationService, () => notificationService);

    const executionNotifications = new ExecutionNotifications(eventBus, notificationService);
    const environmentService = new EnvironmentService(rootLogger.child('EnvironmentService'), eventBus, context.extensionPath);
    const iconRegistry = new IconRegistry(rootLogger.child('IconRegistry'));
    const themeService = new ThemeService(rootLogger.child('ThemeService'));
    const contextKeyService = new ContextKeyService(rootLogger.child('ContextKeyService'));
    const webviewHost = new WebviewHost(rootLogger.child('WebviewHost'));
    const workbenchStatusService = new WorkbenchStatusService(rootLogger.child('WorkbenchStatusService'));
    const treeNodeRegistry = new TreeNodeRegistry(rootLogger.child('TreeNodeRegistry'));
    const cardRegistry = new CardRegistry(rootLogger.child('CardRegistry'));
    const quickActionRegistry = new QuickActionRegistry(rootLogger.child('QuickActionRegistry'));

    collection.addSingleton(TYPES.EnvironmentService, () => environmentService);
    collection.addSingleton(TYPES.IconRegistry, () => iconRegistry);
    collection.addSingleton(TYPES.ThemeService, () => themeService);
    collection.addSingleton(TYPES.ContextKeyService, () => contextKeyService);
    collection.addSingleton(TYPES.WebviewHost, () => webviewHost);
    collection.addSingleton(TYPES.WorkbenchStatusService, () => workbenchStatusService);
    collection.addSingleton(TYPES.TreeNodeRegistry, () => treeNodeRegistry);
    collection.addSingleton(TYPES.CardRegistry, () => cardRegistry);
    collection.addSingleton(TYPES.QuickActionRegistry, () => quickActionRegistry);

    const homeWorkbench = new HomeWorkbench(
      webviewHost,
      cardRegistry,
      quickActionRegistry,
      eventBus,
      rootLogger.child('HomeWorkbench'),
      projectService
    );
    collection.addSingleton(TYPES.HomeWorkbench, () => homeWorkbench);

    const flowBuilder = new FlowBuilderWebview(
      webviewHost,
      projectService,
      technologyRegistry,
      context.secrets,
      context.workspaceState,
    );
    collection.addSingleton(TYPES.FlowBuilderWebview, () => flowBuilder);

    const reportWebview = new ReportWebview(webviewHost, projectService);
    collection.addSingleton(TYPES.ReportWebview, () => reportWebview);

    const frameworkManagerWebview = new FrameworkManagerWebview(webviewHost, frameworkManager);
    collection.addSingleton(TYPES.FrameworkManagerWebview, () => frameworkManagerWebview);

    const runtimeMonitor = new RuntimeMonitorWebview(
      webviewHost,
      eventBus,
      rootLogger.child('RuntimeMonitor')
    );
    collection.addSingleton(TYPES.RuntimeMonitorWebview, () => runtimeMonitor);

    // Register WebviewViewProvider for Output Console
    const consoleProvider = new ConsoleWebviewViewProvider(context.extensionUri, eventBus);
    rootLogger.addSink(consoleProvider);
    context.subscriptions.push(
      vscodeModule.window.registerWebviewViewProvider(ConsoleWebviewViewProvider.viewType, consoleProvider)
    );

    const workspaceFolder = vscodeModule.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
    const outputRoot = () => projectService.manager.getCurrentProjectPath() || workspaceFolder;
    const artifactManager = new ArtifactManager(eventBus, rootLogger.child('ArtifactManager'), outputRoot);
    const reportGenerator = new ReportGenerator(eventBus, rootLogger.child('ReportGenerator'), outputRoot);
    // Note: We don't necessarily need to add artifactManager to DI if it just listens, 
    // but it's good practice. We'll add it to collection or just let it live.
    // For now we just instantiate it so it sets up its listeners.


    collection.addSingleton(TYPES.CommandRegistry, (provider) => {
      const vscodeModule = require('vscode') as typeof vscode;
      const logger = provider.resolve<ILogger>(TYPES.Logger);
      return new CommandRegistry(vscodeModule.commands, eventBus, logger.child('Commands'));
    });

    collection.addSingleton(TYPES.PluginHost, (provider) => {
      const logger = provider.resolve<ILogger>(TYPES.Logger);
      return new PluginHost(eventBus, logger.child('Plugins'));
    });

    stopwatch.lap('Phase 3: DI collection and plugins registered');

    // Phase 4: Build provider
    const provider = new ServiceProvider(collection);
    stopwatch.lap('Phase 4: DI provider built');

    // Phase 5: Initialize services
    rootLogger.info('Initializing services...');

    const configService = provider.resolve(TYPES.ConfigurationService) as ConfigurationService;
    await configService.initialize();

    const stateService = provider.resolve(TYPES.StateService) as StateService;
    await stateService.initialize();

    // Register traditional commands
    registerRunCommands(context, provider);
    registerReportCommands(context, provider);

    context.subscriptions.push(
      vscodeModule.commands.registerCommand('automationStudio.frameworkManager.show', () => {
        provider.resolve<FrameworkManagerWebview>(TYPES.FrameworkManagerWebview).show();
      })
    );

    // Initial sync
    await projectService.initialize();
    await environmentService.checkAll();

    // ── Auto-open workspace on startup ────────────────────────────────────────
    try {
      const nodePath = require('path') as typeof import('path');
      const nodeFs = require('fs') as typeof import('fs');
      const nodeOs = require('os') as typeof import('os');
      const { PROJECT_FILES } = require('@automation-studio/types');

      const existingFolder = vscodeModule.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (existingFolder) {
        // We are in a workspace. Create projects/ directory if not exists
        const projectsPath = nodePath.join(existingFolder, 'projects');
        if (!nodeFs.existsSync(projectsPath)) {
          nodeFs.mkdirSync(projectsPath, { recursive: true });
        }

        // Create common file (README.md) at the workspace level
        const readmePath = nodePath.join(existingFolder, 'README.md');
        if (!nodeFs.existsSync(readmePath)) {
          nodeFs.writeFileSync(
            readmePath,
            `# Automation Studio Workspace\n\nThis is your central workspace for all automation projects.\n\n- **Projects Directory**: \`projects/\`\n- **Common Files**: Place shared resources or configuration templates here.\n`,
            'utf-8'
          );
        }

        // Check if there's exactly one project in the workspace, or if the workspace itself is a project
        let projectToOpen: string | undefined;

        if (nodeFs.existsSync(nodePath.join(existingFolder, PROJECT_FILES.PROJECT_JSON))) {
          projectToOpen = existingFolder;
        } else {
          // Check inside projects/ subdirectory for a project
          const nestedItems = nodeFs.readdirSync(projectsPath, { withFileTypes: true });
          const nestedProjects = [];
          for (const nested of nestedItems) {
            if (nested.isDirectory()) {
              const nestedPath = nodePath.join(projectsPath, nested.name);
              if (nodeFs.existsSync(nodePath.join(nestedPath, PROJECT_FILES.PROJECT_JSON))) {
                nestedProjects.push(nestedPath);
              }
            }
          }
          // If there is exactly one project, auto-open it
          if (nestedProjects.length === 1) {
            projectToOpen = nestedProjects[0];
          }
        }

        if (projectToOpen) {
          rootLogger.info(`Auto-opening project: ${projectToOpen}`);
          await projectService.manager.open(projectToOpen);
        }
      }
    } catch (autoOpenErr) {
      rootLogger.warn('Auto-open workspace/project failed (non-fatal)', {
        error: autoOpenErr instanceof Error ? autoOpenErr.message : String(autoOpenErr),
      });
    }
    // ─────────────────────────────────────────────────────────────────────────





    stopwatch.lap('Phase 5: Services initialized');

    // Phase 6: Register commands
    rootLogger.info('Registering commands...');

    const commandRegistry = provider.resolve(TYPES.CommandRegistry) as CommandRegistry;
    const platformCommands = createPlatformCommands(provider, context, outputChannel);
    const projectCommands = createProjectCommands(provider);
    const doctorCommands = createDoctorCommands(provider, outputChannel);
    const recorderCommands = createRecorderCommands(provider);

    const commandRegistration = commandRegistry.registerMany([
      ...platformCommands,
      ...projectCommands,
      ...doctorCommands,
      ...recorderCommands
    ]);
    context.subscriptions.push({ dispose: () => commandRegistration.dispose() });
    stopwatch.lap('Phase 6: Commands registered');

    // Register Workbench UI Components
    const treeProvider = new WorkspaceExplorerProvider(projectService, treeNodeRegistry, iconRegistry, eventBus, rootLogger.child('WorkspaceExplorer'));
    context.subscriptions.push(vscodeModule.window.registerTreeDataProvider('automationStudio.projectExplorer', treeProvider));

    const flowBuilderLauncher = {
      getChildren: (): vscode.TreeItem[] => {
        const item = new vscodeModule.TreeItem('Open Automation Studio Builder', vscodeModule.TreeItemCollapsibleState.None);
        item.command = { command: 'automationStudio.flowBuilder.show', title: 'Open Automation Studio Builder' };
        item.iconPath = new vscodeModule.ThemeIcon('type-hierarchy-sub');
        return [item];
      },
      getTreeItem: (item: vscode.TreeItem): vscode.TreeItem => item,
    };
    context.subscriptions.push(vscodeModule.window.registerTreeDataProvider('automationStudio.flowBuilderLauncher', flowBuilderLauncher));

    const healthProvider = new HealthTreeDataProvider(rootLogger.child('HealthTree'), environmentService);
    context.subscriptions.push(vscodeModule.window.registerTreeDataProvider('automationStudio.environmentHealth', healthProvider));

    // Register default UX extensions
    treeNodeRegistry.registerProvider(new LogicalNodesProvider(projectService));
    
    cardRegistry.registerCard(new EnvironmentCard(environmentService));
    cardRegistry.registerCard(new RecentProjectsCard(projectService.recentProjects));
    cardRegistry.registerCard(new LatestReportCard());
    cardRegistry.registerCard(new NewsCard());
    
    for (const action of CORE_QUICK_ACTIONS) {
      quickActionRegistry.registerAction(action);
    }

    // Register Status Bar elements
    const projectStatus = workbenchStatusService.registerStatusItem('automationStudio.status.project', 'left', 100);
    const envStatus = workbenchStatusService.registerStatusItem('automationStudio.status.env', 'left', 99);
    const aiStatus = workbenchStatusService.registerStatusItem('automationStudio.status.ai', 'left', 98);
    const recorderStatus = workbenchStatusService.registerStatusItem('automationStudio.status.recorder', 'left', 97);
    
    // Status Bar behavior
    const updateProjectStatus = () => {
      const proj = projectService.manager.getCurrentProject();
      if (proj) {
        workbenchStatusService.updateStatus('automationStudio.status.project', `$(folder-active) Automation Studio Project: ${proj.projectName}`, 'Project loaded');
      } else {
        workbenchStatusService.updateStatus('automationStudio.status.project', '$(robot) Automation Studio: None', 'No project open');
      }
    };
    
    eventBus.subscribe(ProjectEvents.ProjectOpened, updateProjectStatus);
    eventBus.subscribe(ProjectEvents.ProjectClosed, updateProjectStatus);
    updateProjectStatus(); // Initial call

    const updateEnvStatus = () => {
      if (environmentService.status.python) {
        workbenchStatusService.updateStatus('automationStudio.status.env', '$(check) Python', 'Python Ready');
      } else {
        workbenchStatusService.updateStatus('automationStudio.status.env', '$(warning) Python', 'Python Not Ready');
      }
    };
    environmentService.onStatusChanged(updateEnvStatus);
    updateEnvStatus(); // Initial call

    workbenchStatusService.updateStatus('automationStudio.status.ai', '$(hubot) AI', 'AI Ready');
    const recorderStatusId = 'automationStudio.status.recorder';
    const recorderStopStatusId = 'automationStudio.status.recorder.stop';
    workbenchStatusService.updateStatus(recorderStatusId, '$(record-keys) Record', 'Start Recording', 'automationStudio.recorder.start');
    workbenchStatusService.registerStatusItem(recorderStopStatusId, 'left', 96);
    
    eventBus.subscribe('Recorder.RecordingStarted', () => {
      workbenchStatusService.updateStatus(recorderStatusId, '$(circle-filled) Recording...', 'Click to Pause', 'automationStudio.recorder.pause');
      workbenchStatusService.updateStatus(recorderStopStatusId, '$(square-active) Stop', 'Stop & Generate Scenario', 'automationStudio.recorder.stop');
    });

    eventBus.subscribe('Recorder.RecordingPaused', () => {
      workbenchStatusService.updateStatus(recorderStatusId, '$(debug-pause) Paused', 'Click to Resume', 'automationStudio.recorder.resume');
      workbenchStatusService.updateStatus(recorderStopStatusId, '$(square-active) Stop', 'Stop & Generate Scenario', 'automationStudio.recorder.stop');
    });

    eventBus.subscribe('Recorder.RecordingStopped', () => {
      workbenchStatusService.updateStatus(recorderStatusId, '$(record-keys) Record', 'Start Recording', 'automationStudio.recorder.start');
      workbenchStatusService.updateStatus(recorderStopStatusId, '', '');
    });

    eventBus.subscribe('Recorder.RecordingCancelled', () => {
      workbenchStatusService.updateStatus(recorderStatusId, '$(record-keys) Record', 'Start Recording', 'automationStudio.recorder.start');
      workbenchStatusService.updateStatus(recorderStopStatusId, '', '');
    });

    const executionStatusId = 'automationStudio.status.execution';
    workbenchStatusService.registerStatusItem(executionStatusId, 'left', 101);
    
    eventBus.subscribe(ExecutionEvents.ExecutionStarted, (payload: any) => {
      workbenchStatusService.updateStatus(executionStatusId, `$(play-circle) Running... 0%`, 'Click to stop execution', 'automationStudio.stopExecution');
    });

    eventBus.subscribe(ExecutionEvents.ExecutionProgress, (payload: any) => {
      workbenchStatusService.updateStatus(executionStatusId, `$(play-circle) Running... ${payload.progress}%`, 'Click to stop execution', 'automationStudio.stopExecution');
    });

    eventBus.subscribe(ExecutionEvents.ExecutionCompleted, () => {
      workbenchStatusService.updateStatus(executionStatusId, `$(pass) Execution Completed`, 'Execution passed');
      setTimeout(() => workbenchStatusService.updateStatus(executionStatusId, '', ''), 5000);
    });

    eventBus.subscribe(ExecutionEvents.ExecutionFailed, () => {
      workbenchStatusService.updateStatus(executionStatusId, `$(error) Execution Failed`, 'Execution failed');
      setTimeout(() => workbenchStatusService.updateStatus(executionStatusId, '', ''), 5000);
    });

    eventBus.subscribe(ExecutionEvents.ExecutionAborted, () => {
      workbenchStatusService.updateStatus(executionStatusId, `$(stop-circle) Execution Aborted`, 'Execution stopped');
      setTimeout(() => workbenchStatusService.updateStatus(executionStatusId, '', ''), 5000);
    });
    
    // Home Workbench

    // Phase 7: Emit activation event
    stopwatch.lap('Phase 7: UI & Status Bar registered');
    const activationTime = stopwatch.stop();

    eventBus.publish(
      createEvent<ExtensionActivatedPayload>(PlatformEvents.ExtensionActivated, {
        activationTime,
        servicesLoaded: collection.getDescriptors().length,
        commandsRegistered: platformCommands.length,
      }),
    );

    // The Builder is the primary workspace. The Launcher remains available from
    // the dashboard command when users need to choose a project or scenario.

    const breakdown = stopwatch.lapTimes.map(l => `${l.label}: ${l.elapsed.toFixed(1)}ms`).join(', ');
    rootLogger.info(`Automation Studio activated in ${activationTime.toFixed(0)}ms. Breakdown: [${breakdown}]`, {
      services: collection.getDescriptors().length,
      commands: platformCommands.length,
    });

    return { provider, activationTime };
  } catch (error) {
    console.error("BOOTSTRAP ERROR:", error);
    if (error instanceof Error && error.stack) {
      console.error(error.stack);
    }
    throw new ActivationError('bootstrap', {
      cause: error instanceof Error ? error : new Error(String(error)),
    });
  }
}
