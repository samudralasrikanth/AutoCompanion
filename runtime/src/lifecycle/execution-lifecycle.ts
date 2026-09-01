import type { RuntimeEngine } from '../engine/runtime-engine';
import { ExecutionError } from '../errors';

export type LifecycleState = 'idle' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';

export class ExecutionLifecycle {
  private state: LifecycleState = 'idle';

  constructor(private readonly engine: RuntimeEngine) {}

  public getState(): LifecycleState {
    return this.state;
  }

  public async start(): Promise<void> {
    if (this.state !== 'idle') {
      throw new ExecutionError(`Cannot start execution from state: ${this.state}`);
    }
    this.state = 'running';
    await this.engine.executeHooks('on_start');
  }

  public async complete(): Promise<void> {
    if (this.state !== 'running') {
      throw new ExecutionError(`Cannot complete execution from state: ${this.state}`);
    }
    this.state = 'completed';
    await this.engine.executeHooks('on_complete');
  }

  public async fail(error: Error): Promise<void> {
    this.state = 'failed';
    await this.engine.executeHooks('on_fail', error);
  }

  public async cancel(): Promise<void> {
    if (this.state === 'completed' || this.state === 'failed') {
      return;
    }
    this.state = 'cancelled';
    await this.engine.executeHooks('on_cancel');
  }
}
