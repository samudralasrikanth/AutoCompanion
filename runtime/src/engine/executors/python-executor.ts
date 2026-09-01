import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import type { Executor, ExecutorOptions } from './executor';
import type { RuntimeEngine } from '../runtime-engine';
import { ExecutionError } from '../../errors';
import * as path from 'path';
import * as fs from 'fs';

function resolvePythonCommands(): string[] {
  if (process.env['AUTOMATION_STUDIO_PYTHON']) {
    return [process.env['AUTOMATION_STUDIO_PYTHON']];
  }
  return process.platform === 'win32' ? ['python', 'python3'] : ['python3', 'python'];
}

export class PythonExecutor implements Executor {
  public execute(engine: RuntimeEngine, options: ExecutorOptions): Promise<void> {
    const pythonRoots = [
      path.resolve(process.cwd(), 'automationstudio-sdk-certified-v5/src'),
      path.resolve(process.cwd(), 'packages/automationstudio-sdk/src'),
      path.resolve(process.cwd(), 'frameworks/python'),
      path.resolve(__dirname, '../../../../automationstudio-sdk-certified-v5/src'),
      path.resolve(__dirname, '../../../../packages/automationstudio-sdk/src'),
    ].filter(root => fs.existsSync(root));
    const pythonPath = pythonRoots.join(path.delimiter);
    const spawnArgs = options.debug
      ? ['-m', 'debugpy', '--listen', '5678', '--wait-for-client', '-m', 'automation_studio.runner', options.path]
      : ['-m', 'automation_studio.runner', options.path];
    const commands = resolvePythonCommands();

    return this.spawnWithFallback(engine, options, commands, 0, spawnArgs, pythonPath);
  }

  private spawnWithFallback(
    engine: RuntimeEngine,
    options: ExecutorOptions,
    commands: string[],
    index: number,
    spawnArgs: string[],
    pythonPath: string,
  ): Promise<void> {
    const command = commands[index];
    if (!command) {
      return Promise.reject(
        new ExecutionError(`Failed to spawn Python process. Tried: ${commands.join(', ')}`),
      );
    }

    return new Promise((resolve, reject) => {
      engine.plugins.context.logger?.debug?.(
        `Spawning Python process (${command}) for ${options.path} using module runner`,
      );

      const child = spawn(command, spawnArgs, {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          ...process.env,
          PYTHONPATH: pythonPath,
        },
      });

      let hasFailed = false;
      let spawnRetried = false;

      if (options.signal) {
        options.signal.addEventListener('abort', () => {
          engine.plugins.context.logger?.info?.('[PythonExecutor] Received abort signal, killing child process...');
          child.kill('SIGTERM');
          setTimeout(() => {
            if (child.exitCode === null) {
              child.kill('SIGKILL');
            }
          }, 2000);
        });
      }

      this.attachProcessHandlers(engine, options, child, commands, index, spawnArgs, pythonPath, {
        hasFailed: () => hasFailed,
        setFailed: () => {
          hasFailed = true;
        },
        resolve,
        reject,
        onSpawnError: () => {
          if (spawnRetried || index + 1 >= commands.length) {
            return false;
          }
          spawnRetried = true;
          void this.spawnWithFallback(engine, options, commands, index + 1, spawnArgs, pythonPath).then(resolve, reject);
          return true;
        },
      });
    });
  }

  private attachProcessHandlers(
    engine: RuntimeEngine,
    options: ExecutorOptions,
    child: any,
    commands: string[],
    index: number,
    spawnArgs: string[],
    pythonPath: string,
    callbacks: {
      hasFailed: () => boolean;
      setFailed: () => void;
      resolve: () => void;
      reject: (error: Error) => void;
      onSpawnError: () => boolean;
    },
  ): void {
    child.stdout.on('data', (data: Buffer) => {
      const lines = data.toString().split('\n');
      for (const line of lines) {
        if (!line.trim()) continue;

        if (line.includes('__AUTO_IPC__')) {
          try {
            const parts = line.split('__AUTO_IPC__');
            const before = parts[0];
            if (before && before.trim()) {
              engine.plugins.context.logger?.info?.(`[Python stdout] ${before.trim()}`);
            }
            const jsonStr = parts.length > 1 ? parts[1]?.trim() : '';
            if (!jsonStr) continue;

            const eventPayload = JSON.parse(jsonStr) as {
              type: string;
              payload?: { status?: string; scope?: string; key?: string; value?: unknown };
            };
            engine.plugins.context.logger?.info?.(`[Python Event] ${eventPayload.type}`, eventPayload);

            if (eventPayload.type === 'ScenarioFinished' && eventPayload.payload?.status === 'failed') {
              callbacks.setFailed();
            } else if (eventPayload.type === 'VariableUpdated' && eventPayload.payload?.key) {
              const scope = eventPayload.payload.scope || 'scenario';
              if (scope === 'global' || scope === 'suite' || scope === 'scenario' || scope === 'step') {
                engine.context.setVariable(
                  scope,
                  eventPayload.payload.key,
                  eventPayload.payload.value,
                );
              }
            }
          } catch {
            engine.plugins.context.logger?.warn?.(`[PythonExecutor] Failed to parse IPC event: ${line}`);
          }
        } else {
          engine.plugins.context.logger?.info?.(`[Python stdout] ${line}`);
        }
      }
    });

    child.stderr.on('data', (data: Buffer) => {
      engine.plugins.context.logger?.error?.(`[Python stderr] ${data.toString()}`);
    });

    child.on('close', (code: number | null, signal: string | null) => {
      if (options.signal?.aborted) {
        callbacks.reject(new ExecutionError(`Scenario cancelled by user (signal: ${signal})`));
      } else if (code === 0 && !callbacks.hasFailed()) {
        callbacks.resolve();
      } else {
        callbacks.reject(new ExecutionError(`Python scenario failed with exit code ${code}`));
      }
    });

    child.on('error', (err: Error) => {
      if (callbacks.onSpawnError()) {
        return;
      }
      callbacks.reject(new ExecutionError(`Failed to spawn Python process (${commands[index]})`, { cause: err }));
    });
  }
}
