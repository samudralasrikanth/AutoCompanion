/**
 * Plugin Host - infrastructure for plugin lifecycle management.
 * Manages registration, loading, unloading, and discovery.
 */

import type {
  IPluginHost,
  IPluginManifest,
  IPlugin,
  PluginHealthReport,
  ILogger,
  IEventBus,
} from '@automation-studio/types';
import { PluginState, HealthStatus } from '@automation-studio/types';
import { createEvent, PlatformEvents, type PluginLoadedPayload, type PluginUnloadedPayload } from '@automation-studio/events';
import { PluginNotFoundError, PluginLoadError } from '../errors/plugin-error';

interface PluginRegistration {
  manifest: IPluginManifest;
  state: PluginState;
  instance?: IPlugin;
}

export class PluginHost implements IPluginHost {
  private readonly plugins: Map<string, PluginRegistration> = new Map();

  constructor(
    private readonly eventBus: IEventBus,
    private readonly logger: ILogger,
  ) {}

  public registerPlugin(manifest: IPluginManifest): void {
    if (this.plugins.has(manifest.id)) {
      this.logger.warn(`Plugin already registered: ${manifest.id}`);
      return;
    }

    this.plugins.set(manifest.id, {
      manifest,
      state: PluginState.Discovered,
    });

    this.logger.info(`Plugin registered: ${manifest.id} v${manifest.version}`, {
      capabilities: [...manifest.capabilities],
    });
  }

  public async loadPlugin(pluginId: string): Promise<void> {
    const registration = this.plugins.get(pluginId);
    if (!registration) {
      throw new PluginNotFoundError(pluginId);
    }

    if (registration.state === PluginState.Active) {
      this.logger.debug(`Plugin already active: ${pluginId}`);
      return;
    }

    registration.state = PluginState.Loading;
    this.logger.info(`Loading plugin: ${pluginId}`);

    try {
      if (registration.instance) {
        await registration.instance.activate();
      }

      registration.state = PluginState.Active;

      this.eventBus.publish(
        createEvent<PluginLoadedPayload>(PlatformEvents.PluginLoaded, {
          pluginId,
          version: registration.manifest.version,
          capabilities: registration.manifest.capabilities.map(String),
        }),
      );

      this.logger.info(`Plugin loaded: ${pluginId}`);
    } catch (error) {
      registration.state = PluginState.Error;
      throw new PluginLoadError(
        pluginId,
        error instanceof Error ? error.message : String(error),
        { cause: error instanceof Error ? error : undefined },
      );
    }
  }

  public async unloadPlugin(pluginId: string): Promise<void> {
    const registration = this.plugins.get(pluginId);
    if (!registration) {
      throw new PluginNotFoundError(pluginId);
    }

    registration.state = PluginState.Unloading;
    this.logger.info(`Unloading plugin: ${pluginId}`);

    try {
      if (registration.instance) {
        await registration.instance.deactivate();
      }

      registration.state = PluginState.Unloaded;
      registration.instance = undefined;

      this.eventBus.publish(
        createEvent<PluginUnloadedPayload>(PlatformEvents.PluginUnloaded, {
          pluginId,
          reason: 'manual',
        }),
      );

      this.logger.info(`Plugin unloaded: ${pluginId}`);
    } catch (error) {
      registration.state = PluginState.Error;
      this.logger.error(
        `Plugin unload failed: ${pluginId}`,
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }

  public async discover(directory: string): Promise<ReadonlyArray<IPluginManifest>> {
    this.logger.info(`Discovering plugins in: ${directory}`);
    // Plugin discovery will be implemented when file system scanning is wired
    // This returns registered manifests for now
    return Array.from(this.plugins.values()).map((r) => r.manifest);
  }

  public health(): PluginHealthReport {
    const pluginDetails = Array.from(this.plugins.values()).map((reg) => ({
      id: reg.manifest.id,
      state: reg.state,
      health: {
        status: reg.state === PluginState.Active
          ? HealthStatus.Healthy
          : reg.state === PluginState.Error
            ? HealthStatus.Unhealthy
            : HealthStatus.Degraded,
        message: `Plugin is ${reg.state}`,
      },
    }));

    return {
      totalPlugins: this.plugins.size,
      activePlugins: pluginDetails.filter((p) => p.state === PluginState.Active).length,
      errorPlugins: pluginDetails.filter((p) => p.state === PluginState.Error).length,
      plugins: pluginDetails,
    };
  }

  public getPlugin(pluginId: string): IPlugin | undefined {
    return this.plugins.get(pluginId)?.instance;
  }

  public getLoadedPlugins(): ReadonlyArray<IPlugin> {
    return Array.from(this.plugins.values())
      .filter((r) => r.instance && r.state === PluginState.Active)
      .map((r) => r.instance as IPlugin);
  }
}
