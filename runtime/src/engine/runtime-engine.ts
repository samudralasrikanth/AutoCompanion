import { ConfigResolver } from '../config/config-resolver';
import { ExecutionContext } from '../context/execution-context';
import { CapabilityRegistry } from './capability-registry';
import type { IEventBus, ILogger } from '@automation-studio/types';
import type { TechnologyRegistry } from '@automation-studio/registry';
import { PluginLoader } from '@automation-studio/registry';

export class RuntimeEngine {
  public readonly config = new ConfigResolver();
  public readonly context = new ExecutionContext();
  public readonly plugins: PluginLoader;
  public readonly capabilities = new CapabilityRegistry();

  constructor(
    private readonly eventBus: IEventBus,
    private readonly logger: ILogger,
    public readonly technologyRegistry?: TechnologyRegistry
  ) {
    this.plugins = new PluginLoader({
      config: this.config.resolve(),
      logger: this.logger,
      eventBus: this.eventBus,
      registerHook: this.registerHook.bind(this),
      engineVersion: '0.1.0' // IDE/Engine version
    });
  }

  private hooks: Map<string, Array<(...args: any[]) => void | Promise<void>>> = new Map();

  private registerHook(hookName: string, callback: (...args: any[]) => void | Promise<void>): void {
    if (!this.hooks.has(hookName)) {
      this.hooks.set(hookName, []);
    }
    this.hooks.get(hookName)?.push(callback);
  }

  public async executeHooks(hookName: string, ...args: any[]): Promise<void> {
    const hooks = this.hooks.get(hookName) || [];
    for (const hook of hooks) {
      await hook(...args);
    }
  }

  public async shutdown(): Promise<void> {
    await this.plugins.shutdownAll();
    this.logger.info('Runtime Engine shutdown complete.');
  }
}
