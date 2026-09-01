import type { IEventBus, ILogger } from '@automation-studio/types';
import { ExecutionEvents, createEvent } from '@automation-studio/events';
import { generateUUID } from '@automation-studio/shared';
import { RuntimeEngine } from './runtime-engine';
import { ScenarioRunner } from './scenario-runner';

export interface ExecutionJob {
  readonly id: string;
  readonly path: string;
  readonly status: 'queued' | 'running' | 'completed' | 'failed' | 'aborted';
  readonly startTime?: number;
  readonly endTime?: number;
  readonly error?: string;
  readonly progress: number;
}

import type { TechnologyRegistry } from '@automation-studio/registry';

export class ExecutionManager {
  private readonly jobs = new Map<string, ExecutionJob>();
  private readonly abortControllers = new Map<string, AbortController>();
  public readonly engine: RuntimeEngine;
  private readonly runner: ScenarioRunner;

  constructor(
    private readonly eventBus: IEventBus,
    private readonly logger: ILogger,
    private readonly technologyRegistry?: TechnologyRegistry
  ) {
    this.engine = new RuntimeEngine(this.eventBus, this.logger, this.technologyRegistry);
    this.runner = new ScenarioRunner(this.engine);
  }

  public async runScenario(scenarioPath: string, options?: { debug?: boolean }): Promise<string> {
    const executionId = generateUUID();
    
    this.jobs.set(executionId, {
      id: executionId,
      path: scenarioPath,
      status: 'queued',
      progress: 0,
    });

    const abortController = new AbortController();
    this.abortControllers.set(executionId, abortController);

    // Run asynchronously
    this.executeJob(executionId, scenarioPath, abortController.signal, options).catch(err => {
      this.logger.error(`Unhandled error in executeJob for ${executionId}:`, err);
    });

    return executionId;
  }

  private async executeJob(executionId: string, scenarioPath: string, signal: AbortSignal, options?: { debug?: boolean }): Promise<void> {
    const job = this.jobs.get(executionId)!;
    
    this.jobs.set(executionId, {
      ...job,
      status: 'running',
      startTime: Date.now(),
    });

    this.eventBus.publish(createEvent(ExecutionEvents.ExecutionStarted, {
      executionId,
      scenarioPath,
      timestamp: Date.now(),
    }));

    // Periodic progress simulator for now until Python IPC is fully robust
    let currentProgress = 0;
    const progressInterval = setInterval(() => {
      if (currentProgress < 90) {
        currentProgress += 5;
        this.updateProgress(executionId, currentProgress, `Executing step...`);
      }
    }, 1000);

    try {
      await this.runner.runScenario({ path: scenarioPath, signal, debug: options?.debug });

      const runningJob = this.jobs.get(executionId)!;
      const duration = Date.now() - runningJob.startTime!;
      this.jobs.set(executionId, {
        ...runningJob,
        status: 'completed',
        endTime: Date.now(),
        progress: 100,
      });

      this.eventBus.publish(createEvent(ExecutionEvents.ExecutionCompleted, {
        executionId,
        duration,
      }));

    } catch (error: any) {
      const runningJob = this.jobs.get(executionId)!;
      const duration = Date.now() - (runningJob.startTime ?? Date.now());
      
      if (signal.aborted) {
        this.jobs.set(executionId, {
          ...runningJob,
          status: 'aborted',
          endTime: Date.now(),
        });
        
        this.eventBus.publish(createEvent(ExecutionEvents.ExecutionAborted, {
          executionId,
          duration,
        }));
      } else {
        this.jobs.set(executionId, {
          ...runningJob,
          status: 'failed',
          endTime: Date.now(),
          error: error.message,
        });

        this.eventBus.publish(createEvent(ExecutionEvents.ExecutionFailed, {
          executionId,
          duration,
          error: error.message,
        }));
      }
    } finally {
      clearInterval(progressInterval);
      this.abortControllers.delete(executionId);
    }
  }

  public abortExecution(executionId: string): void {
    const controller = this.abortControllers.get(executionId);
    if (controller) {
      controller.abort();
    }
  }

  public updateProgress(executionId: string, progress: number, step: string): void {
    const job = this.jobs.get(executionId);
    if (job) {
      this.jobs.set(executionId, { ...job, progress });
      this.eventBus.publish(createEvent(ExecutionEvents.ExecutionProgress, {
        executionId,
        progress,
        step,
      }));
    }
  }

  public getJobs(): ExecutionJob[] {
    return Array.from(this.jobs.values());
  }

  public getJob(id: string): ExecutionJob | undefined {
    return this.jobs.get(id);
  }
}
