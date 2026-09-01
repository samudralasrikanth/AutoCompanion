/**
 * Configuration Service implementation.
 * Wraps VS Code workspace.getConfiguration with typed access,
 * change detection, and event emission.
 */

import type * as vscode from 'vscode';
import type { IConfigurationService, IEventBus, ILogger } from '@automation-studio/types';
import { HealthStatus, type ServiceHealth, ConfigurationScope } from '@automation-studio/types';
import { createEvent, PlatformEvents, type ConfigurationChangedPayload } from '@automation-studio/events';
import { DisposableStore } from '@automation-studio/shared';
import { CONFIGURATION_SECTION, CONFIGURATION_SCHEMA, getDefaultValue } from './configuration-schema';

export class ConfigurationService implements IConfigurationService {
  public readonly serviceName = 'ConfigurationService' as const;
  private readonly disposables = new DisposableStore();
  private readonly changeHandlers: Array<(key: string, value: unknown) => void> = [];
  private initialized = false;

  constructor(
    private readonly workspace: typeof vscode.workspace,
    private readonly eventBus: IEventBus,
    private readonly logger: ILogger,
  ) {}

  public async initialize(): Promise<void> {
    this.logger.info('Initializing ConfigurationService');

    // Watch for configuration changes
    const watcher = this.workspace.onDidChangeConfiguration((e) => {
      for (const schema of CONFIGURATION_SCHEMA) {
        const fullKey = `${CONFIGURATION_SECTION}.${schema.key}`;
        if (e.affectsConfiguration(fullKey)) {
          const newValue = this.get(schema.key);
          this.notifyChange(schema.key, newValue);
        }
      }
    });

    this.disposables.add(watcher);
    this.initialized = true;
    this.logger.info('ConfigurationService initialized');
  }

  public get<T>(key: string, defaultValue?: T): T {
    const config = this.workspace.getConfiguration(CONFIGURATION_SECTION);
    const value = config.get<T>(key);

    if (value !== undefined) {
      return value;
    }

    if (defaultValue !== undefined) {
      return defaultValue;
    }

    const schemaDefault = getDefaultValue<T>(key);
    return schemaDefault as T;
  }

  public async set(key: string, value: unknown, global = false): Promise<void> {
    const config = this.workspace.getConfiguration(CONFIGURATION_SECTION);
    const target = global
      ? { languageId: undefined }
      : undefined;

    await config.update(key, value, global);
    this.notifyChange(key, value);
  }

  public onChange(handler: (key: string, value: unknown) => void): { dispose(): void } {
    this.changeHandlers.push(handler);
    return {
      dispose: (): void => {
        const idx = this.changeHandlers.indexOf(handler);
        if (idx >= 0) {
          this.changeHandlers.splice(idx, 1);
        }
      },
    };
  }

  public health(): ServiceHealth {
    return {
      status: this.initialized ? HealthStatus.Healthy : HealthStatus.Unhealthy,
      message: this.initialized ? 'Configuration service is healthy' : 'Not initialized',
    };
  }

  public version(): string {
    return '0.1.0';
  }

  public async dispose(): Promise<void> {
    this.disposables.dispose();
    this.changeHandlers.length = 0;
    this.initialized = false;
  }

  private notifyChange(key: string, newValue: unknown): void {
    for (const handler of this.changeHandlers) {
      try {
        handler(key, newValue);
      } catch {
        // Handler errors must not break configuration
      }
    }

    this.eventBus.publish(
      createEvent<ConfigurationChangedPayload>(PlatformEvents.ConfigurationChanged, {
        key,
        oldValue: undefined,
        newValue,
      }),
    );
  }
}
