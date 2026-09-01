import type { IPluginContext, AutomationPluginManifest } from '@automation-studio/types';
import { VersionChecker } from './version-checker';

export type PluginHealthStatus = 'Healthy' | 'Failed' | 'Disabled';

export interface PluginMetrics {
  status: PluginHealthStatus;
  startupMs?: number;
  memoryMb?: number;
  failureReason?: string;
}

export interface PluginLoaderOptions {
  config: any;
  logger: any;
  eventBus: any;
  registerHook: (hookName: string, callback: (...args: any[]) => void | Promise<void>) => void;
  engineVersion: string;
}

export class PluginLoader {
  private plugins: Map<string, any> = new Map();
  private manifests: Map<string, AutomationPluginManifest> = new Map();
  private metrics: Map<string, PluginMetrics> = new Map();
  private options: PluginLoaderOptions;
  public readonly context: IPluginContext;

  constructor(options: PluginLoaderOptions) {
    this.options = options;
    this.context = {
      config: options.config,
      logger: options.logger,
      eventBus: options.eventBus,
      registerHook: options.registerHook
    };
  }

  public async loadPlugin(manifest: AutomationPluginManifest, pluginModule: any): Promise<void> {
    const compat = VersionChecker.isCompatible(manifest.engine, this.options.engineVersion);
    if (!compat.compatible) {
      this.metrics.set(manifest.id, { status: 'Failed', failureReason: compat.reason });
      this.context.logger?.error?.(`Plugin ${manifest.id} failed SDK compatibility: ${compat.reason}`);
      return; // Do not throw, isolate failure
    }

    if (!pluginModule.default) {
      this.metrics.set(manifest.id, { status: 'Failed', failureReason: 'Missing default export' });
      this.context.logger?.error?.(`Plugin ${manifest.id} must have a default export`);
      return;
    }
    
    let plugin;
    try {
      plugin = new pluginModule.default();
    } catch (e: any) {
      this.metrics.set(manifest.id, { status: 'Failed', failureReason: `Constructor threw: ${e.message}` });
      return;
    }
    
    try {
      const startMem = process.memoryUsage().heapUsed;
      const startTime = performance.now();
      
      await plugin.initialize(this.context);
      
      const endTime = performance.now();
      const endMem = process.memoryUsage().heapUsed;
      
      const startupMs = endTime - startTime;
      const memoryMb = (endMem - startMem) / 1024 / 1024;

      // Crash Isolation / Performance Limits
      if (startupMs > 2000) {
        throw new Error(`Plugin exceeded startup time limit of 2000ms (${startupMs.toFixed(2)}ms)`);
      }
      if (memoryMb > 50) {
        throw new Error(`Plugin exceeded memory spike limit of 50MB (${memoryMb.toFixed(2)}MB)`);
      }

      this.plugins.set(manifest.id, plugin);
      this.manifests.set(manifest.id, manifest);
      this.metrics.set(manifest.id, { status: 'Healthy', startupMs, memoryMb });
      this.context.logger?.debug?.(`Successfully loaded plugin: ${manifest.name} v${manifest.version}`);
    } catch (error: any) {
      this.metrics.set(manifest.id, { status: 'Failed', failureReason: error.message });
      this.context.logger?.error?.(`Failed to initialize plugin ${manifest.id}: ${error.message}`);
      // Do not throw to keep extension host alive
    }
  }

  public getPlugin(pluginId: string): any | undefined {
    return this.plugins.get(pluginId);
  }
  
  public getAllPlugins(): any[] {
    return Array.from(this.plugins.values());
  }

  public getManifests(): AutomationPluginManifest[] {
    return Array.from(this.manifests.values());
  }

  public getMetrics(pluginId: string): PluginMetrics | undefined {
    return this.metrics.get(pluginId);
  }

  public async shutdownAll(): Promise<void> {
    for (const [id, plugin] of this.plugins.entries()) {
      try {
        if (typeof plugin.shutdown === 'function') await plugin.shutdown();
        if (typeof plugin.dispose === 'function') await plugin.dispose();
      } catch (error) {
        this.context.logger?.error?.(`Error shutting down plugin ${id}`, error);
      }
    }
    this.plugins.clear();
    this.manifests.clear();
  }
}
