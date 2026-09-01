import type { RuntimeEngine } from './runtime-engine';
import { ExecutionError } from '../errors';
import * as path from 'path';
import * as fs from 'fs';
import { PythonExecutor } from './executors/python-executor';
import { IScenario } from '@automation-studio/sdk';
import { ScenarioCompiler } from './compiler/scenario-compiler';
import { ExecutionScheduler } from './scheduler/execution-scheduler';
import { ExecutionBus } from './events/execution-bus';

export interface ScenarioRunOptions {
  path: string;
  parameters?: Record<string, unknown>;
  signal?: AbortSignal;
  debug?: boolean;
}

export class ScenarioRunner {
  private compiler = new ScenarioCompiler();
  public readonly bus = new ExecutionBus();
  public activeScheduler?: ExecutionScheduler;

  constructor(private readonly engine: RuntimeEngine) {
    // We could wire bus events to logger here
    this.bus.subscribe('NodeStarted', (event) => {
        this.engine.plugins.context.logger?.info?.(`NodeStarted: ${event.nodeId}`);
    });
    this.bus.subscribe('NodeFinished', (event) => {
        this.engine.plugins.context.logger?.info?.(`NodeFinished: ${event.nodeId} (Success: ${event.payload?.success})`);
    });
    this.bus.subscribe('BreakpointHit', (event) => {
        this.engine.plugins.context.logger?.info?.(`BreakpointHit: ${event.nodeId}`);
    });
  }

  public async runScenario(options: ScenarioRunOptions): Promise<void> {
    this.engine.plugins.context.logger?.info?.(`Starting scenario: ${options.path}`);
    
    const ext = path.extname(options.path);
    
    if (ext === '.py') {
      const executor = new PythonExecutor();
      await this.engine.executeHooks('before_scenario', options);
      try {
        await executor.execute(this.engine, options);
        await this.engine.executeHooks('after_scenario', { status: 'passed' });
      } catch (error) {
        await this.engine.executeHooks('after_scenario', { status: 'failed', error });
        throw new ExecutionError(`Scenario failed: ${options.path}`, { cause: error });
      }
      return;
    } 

    if (ext === '.json') {
      const fileContent = await fs.promises.readFile(options.path, 'utf8');
      const scenario: IScenario = JSON.parse(fileContent);

      const plan = this.compiler.compile(scenario);
      this.activeScheduler = new ExecutionScheduler(plan, this.bus);
      
      await this.engine.executeHooks('before_scenario', options);
      try {
        await this.activeScheduler.execute();
        await this.engine.executeHooks('after_scenario', { status: 'passed' });
      } catch (error) {
        await this.engine.executeHooks('after_scenario', { status: 'failed', error });
        throw new ExecutionError(`Scenario failed: ${options.path}`, { cause: error });
      } finally {
        this.activeScheduler = undefined;
      }
      return;
    }
    
    throw new ExecutionError(`No executor found for scenario: ${options.path} (ext: ${ext})`);
  }
}
