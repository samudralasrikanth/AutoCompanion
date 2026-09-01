import type { RuntimeEngine } from '../runtime-engine';

export interface ExecutorOptions {
  path: string;
  parameters?: Record<string, unknown>;
  signal?: AbortSignal;
  debug?: boolean;
}

export interface Executor {
  execute(engine: RuntimeEngine, options: ExecutorOptions): Promise<void>;
}
