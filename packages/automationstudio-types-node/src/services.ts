/**
 * Service contracts.
 * Every platform service implements IService for lifecycle management.
 * Specific service interfaces extend IService with domain methods.
 */

import type { IAsyncDisposable } from './di';

// ─── Service Health ──────────────────────────────────────────────────────────

export enum HealthStatus {
  Healthy = 'healthy',
  Degraded = 'degraded',
  Unhealthy = 'unhealthy',
}

export interface ServiceHealth {
  readonly status: HealthStatus;
  readonly message: string;
  readonly details?: Record<string, unknown>;
}

// ─── Base Service ────────────────────────────────────────────────────────────

export interface IService extends IAsyncDisposable {
  readonly serviceName: string;

  initialize(): Promise<void>;

  health(): ServiceHealth;

  version(): string;
}

// ─── Service Interfaces ──────────────────────────────────────────────────────

export interface IProjectService extends IService {
  readonly serviceName: 'ProjectService';
}

export interface IConfigurationService extends IService {
  readonly serviceName: 'ConfigurationService';

  get<T>(key: string): T | undefined;
  get<T>(key: string, defaultValue: T): T;

  set(key: string, value: unknown, global?: boolean): Promise<void>;

  onChange(handler: (key: string, value: unknown) => void): { dispose(): void };
}

export interface IWorkspaceService extends IService {
  readonly serviceName: 'WorkspaceService';
}

export interface ICommandService extends IService {
  readonly serviceName: 'CommandService';
}

export interface ILoggingService extends IService {
  readonly serviceName: 'LoggingService';
}

export interface IEventService extends IService {
  readonly serviceName: 'EventService';
}

export interface IExtensionService extends IService {
  readonly serviceName: 'ExtensionService';
}

export interface IPluginService extends IService {
  readonly serviceName: 'PluginService';
}

export interface ISettingsService extends IService {
  readonly serviceName: 'SettingsService';
}

export interface IStateService extends IService {
  readonly serviceName: 'StateService';
}
