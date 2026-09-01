import * as vscode from 'vscode';
import { 
    IRecorderPlugin, 
    IRecorderRegistry, 
    RecordSession, 
    RawEvent 
} from '@automation-studio/recorder';
import { IScenario } from '@automation-studio/sdk';
import type { Timestamp, ILogger, IEventBus, IServiceProvider } from '@automation-studio/types';
import { TYPES } from '../di/types';
import { EventNormalizer } from '../engine/pipeline/event-normalizer';
import { EventValidator } from '../engine/pipeline/event-validator';
import { EventResolver } from '../engine/pipeline/event-resolver';
import { RecorderOptimizer } from '../engine/recorder-optimizer';
import { ActivityBuilder } from '../engine/pipeline/activity-builder';
import { ScenarioBuilder } from '../engine/pipeline/scenario-builder';
import { ScenarioSerializer } from '../engine/pipeline/scenario-serializer';
import { LocalScenarioRepository } from '@automation-studio/sdk';
import { randomUUID } from 'crypto';
import * as path from 'path';
import type { IContextKeyService } from './workbench-types';

export class RecorderManager {
    private activePlugin: IRecorderPlugin | undefined;
    private session: RecordSession | undefined;
    private currentSessionOptions?: { projectPath?: string, scenarioId?: string, scenarioName?: string };

    // Pipeline
    private normalizer = new EventNormalizer();
    private validator = new EventValidator();
    private resolver = new EventResolver();
    private optimizer = new RecorderOptimizer();
    private activityBuilder = new ActivityBuilder();
    private scenarioBuilder = new ScenarioBuilder();
    private serializer: ScenarioSerializer | undefined;

    constructor(
        private readonly registry: IRecorderRegistry,
        private readonly eventBus?: IEventBus,
        private readonly contextKeyService?: IContextKeyService,
        private readonly logger?: ILogger,
        private readonly provider?: IServiceProvider
    ) {
        const rootPath = this.getProjectPath();
        if (rootPath) {
            const repo = new LocalScenarioRepository(rootPath);
            this.serializer = new ScenarioSerializer(repo);
        }
    }

    private getProjectPath(): string | undefined {
        try {
            if (this.provider) {
                const projectService = this.provider.resolve<any>(TYPES.ProjectService);
                const projectPath = projectService?.manager?.getCurrentProjectPath();
                if (projectPath) return projectPath;
            }
        } catch (e) {
            // ignore
        }
        return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    }

    private createEvent<T>(type: string, payload: T) {
        return {
            id: randomUUID() as any,
            correlationId: this.session?.id || randomUUID() as any,
            source: 'RecorderManager',
            type,
            payload,
            timestamp: Date.now() as Timestamp
        };
    }

    public async startRecording(
        pluginId: string = 'vision',
        options?: { projectPath?: string, scenarioId?: string, scenarioName?: string }
    ): Promise<void> {
        if (this.session && this.session.status !== 'error' && this.session.status !== 'completed' && this.session.status !== 'idle') {
        if (this.session.status === 'paused') {
          return this.resumeRecording();
        }
        vscode.window.showWarningMessage('A recording session is already active.');
        return;
      }

      const plugin = this.registry.getPlugin(pluginId);
      if (!plugin) {
        vscode.window.showErrorMessage(`Recorder plugin '${pluginId}' not found.`);
        return;
      }

      // Eagerly initialise the serializer from the options path so that
      // generateScenario() can succeed even when the ProjectService in-memory
      // state is not yet populated (e.g. on first launch before auto-open completes).
      const eagerProjectPath = options?.projectPath || this.getProjectPath();
      if (eagerProjectPath) {
        const repo = new LocalScenarioRepository(eagerProjectPath);
        this.serializer = new ScenarioSerializer(repo);
      }

      this.currentSessionOptions = options;
      this.activePlugin = plugin;
        this.session = {
            id: (options && options.scenarioId) ? options.scenarioId : randomUUID(),
            technology: plugin.metadata.technology,
            startedAt: Date.now(),
            status: 'recording',
            statistics: {
                eventCount: 0,
                clickCount: 0,
                keyCount: 0,
                windowChanges: 0,
                durationMs: 0,
                errors: 0,
                warnings: 0
            },
            screenshots: [],
            events: [],
            metadata: {}
        };
        if (options && options.scenarioName) {
            this.session.name = options.scenarioName;
        }

        this.optimizer = new RecorderOptimizer(); // reset optimizer state

        this.activePlugin.onEvent((event: RawEvent) => this.handleRawEvent(event));
        this.activePlugin.onDisconnected(() => this.stopRecording());

        await this.activePlugin.start();
        
        await this.setContext('automationStudio.recordingState', 'recording');
        this.eventBus?.publish(this.createEvent('Recorder.RecordingStarted', { sessionId: this.session.id }));
    }

    private async setContext(key: string, value: any): Promise<void> {
        if (this.contextKeyService) {
            await this.contextKeyService.setContext(key, value);
        } else {
            await vscode.commands.executeCommand('setContext', key, value);
        }
    }

    private handleRawEvent(rawEvent: RawEvent) {
        if (!this.session || this.session.status !== 'recording') return;
        this.session.statistics.eventCount++;
        this.logger?.debug('RecorderManager: Received raw event', { rawEvent });

        // 1. Normalize
        const normResult = this.normalizer.normalize(rawEvent);
        this.processResultWarnings(normResult);
        if (!normResult.data) {
            this.logger?.warn('RecorderManager: Normalization yielded no data');
            return;
        }

        // 2. Validate
        const valResult = this.validator.validate(normResult.data);
        this.processResultWarnings(valResult);
        if (!valResult.data || !valResult.data.isValid) {
            this.logger?.warn('RecorderManager: Validation failed or event invalid', { validationReason: valResult.data?.validationReason });
            return;
        }

        // 3. Resolve
        const resResult = this.resolver.resolve(valResult.data);
        this.processResultWarnings(resResult);
        if (!resResult.data) {
            this.logger?.warn('RecorderManager: Resolution yielded no data');
            return;
        }

        // 4. Optimize
        const optResult = this.optimizer.optimize(resResult.data);
        this.processResultWarnings(optResult);
        
        if (optResult.data && optResult.data.length > 0) {
            for (const semanticAction of optResult.data) {
                this.logger?.info('RecorderManager: Generated semantic action', { semanticAction });
                this.session.events.push(semanticAction);
                if (semanticAction.action === 'click') this.session.statistics.clickCount++;
                if (semanticAction.action === 'type') this.session.statistics.keyCount++;
                this.eventBus?.publish(this.createEvent('Recorder.PipelineProgress', { sessionId: this.session.id, action: semanticAction.action }));
            }
        }
    }

    private processResultWarnings(result: { errors: string[], warnings: string[] }) {
        if (!this.session) return;
        this.session.statistics.errors += result.errors.length;
        this.session.statistics.warnings += result.warnings.length;
        
        if (result.errors.length > 0) {
            this.logger?.error('RecorderManager: Pipeline errors occurred', undefined, { errors: result.errors });
        }
        if (result.warnings.length > 0) {
            this.logger?.warn('RecorderManager: Pipeline warnings occurred', { warnings: result.warnings });
        }
    }

    public async pauseRecording(): Promise<void> {
        if (this.session && this.session.status === 'recording') {
            await this.activePlugin?.pause();
            this.session.status = 'paused';
            await this.setContext('automationStudio.recordingState', 'paused');
            this.eventBus?.publish(this.createEvent('Recorder.RecordingPaused', { sessionId: this.session.id }));
        }
    }

    public async resumeRecording(): Promise<void> {
        if (this.session && this.session.status === 'paused') {
            await this.activePlugin?.resume();
            this.session.status = 'recording';
            await this.setContext('automationStudio.recordingState', 'recording');
            this.eventBus?.publish(this.createEvent('Recorder.RecordingStarted', { sessionId: this.session.id }));
        }
    }

    public async stopRecording(): Promise<void> {
        if (!this.session || this.session.status === 'completed' || this.session.status === 'idle') return;
        
        this.session.status = 'stopping';
        await this.activePlugin?.stop();
        
        // Flush remaining buffers in optimizer
        const finalOptResult = { data: [] as any[], errors: [], warnings: [] };
        const finalAction = this.optimizer.flushBuffer();
        if (finalAction) {
            this.session.events.push(finalAction);
            if (finalAction.action === 'click') this.session.statistics.clickCount++;
            if (finalAction.action === 'type') this.session.statistics.keyCount++;
        }

        this.session.endedAt = Date.now() as Timestamp;
        this.session.statistics.durationMs = this.session.endedAt - this.session.startedAt;
        this.session.status = 'completed';

        await this.setContext('automationStudio.recordingState', 'idle');
        this.eventBus?.publish(this.createEvent('Recorder.RecordingStopped', { sessionId: this.session.id }));
        
        await this.generateScenario();
    }

    public async cancelRecording(): Promise<void> {
        if (!this.session) return;
        this.session.status = 'idle';
        await this.activePlugin?.stop();
        await this.setContext('automationStudio.recordingState', 'idle');
        this.eventBus?.publish(this.createEvent('Recorder.RecordingCancelled', { sessionId: this.session.id }));
        this.session = undefined;
    }

    public async generateScenario(): Promise<void> {
        if (!this.session) return;

        const rootPath = this.currentSessionOptions?.projectPath || this.getProjectPath();
        if (rootPath) {
            const repo = new LocalScenarioRepository(rootPath);
            this.serializer = new ScenarioSerializer(repo);
        } else {
            this.serializer = undefined;
        }

        if (!this.serializer) {
            vscode.window.showErrorMessage('Cannot generate scenario: No active project is open.');
            return;
        }

        try {
            // 5. Build Activities (ScenarioSteps)
            const scenarioSteps = [];
            for (const action of this.session.events) {
                const actResult = this.activityBuilder.build(action);
                this.processResultWarnings(actResult);
                if (actResult.data) {
                    scenarioSteps.push(actResult.data);
                }
            }

            // 6. Build Scenario
            const scenario = this.scenarioBuilder.build(this.session, scenarioSteps);

            // 7. Serialize
            await this.serializer.serialize(scenario);

            this.eventBus?.publish(this.createEvent('Recorder.ScenarioGenerated', { sessionId: this.session.id, scenarioId: scenario.id }));
            this.eventBus?.publish(this.createEvent('Recorder.ScenarioSaved', { scenarioId: scenario.id }));
            
            vscode.window.showInformationMessage(`Scenario ${scenario.name} generated successfully!`);
            
            // Auto open the file
            if (rootPath) {
                const filePath = path.join(rootPath, 'scenarios', `${scenario.id}.scenario.json`);
                const doc = await vscode.workspace.openTextDocument(filePath);
                await vscode.window.showTextDocument(doc);
            }
        } catch (e: any) {
            this.eventBus?.publish(this.createEvent('Recorder.RecordingError', { sessionId: this.session.id, error: e.message }));
            vscode.window.showErrorMessage(`Failed to generate scenario: ${e.message}`);
        }
    }

    public isRecording(): boolean {
        return this.session?.status === 'recording';
    }
}
