/**
 * Platform event type constants and payload interfaces.
 */

// ─── Event Type Constants ────────────────────────────────────────────────────

export const PlatformEvents = {
  // Extension lifecycle
  ExtensionActivated: 'platform.extension.activated',
  ExtensionDeactivating: 'platform.extension.deactivating',

  // Service lifecycle
  ServiceInitialized: 'platform.service.initialized',
  ServiceDisposed: 'platform.service.disposed',
  ServiceError: 'platform.service.error',

  // Configuration
  ConfigurationChanged: 'platform.configuration.changed',
  ConfigurationReloaded: 'platform.configuration.reloaded',

  // Commands
  CommandExecuted: 'platform.command.executed',
  CommandFailed: 'platform.command.failed',

  // Plugins
  PluginDiscovered: 'platform.plugin.discovered',
  PluginLoaded: 'platform.plugin.loaded',
  PluginUnloaded: 'platform.plugin.unloaded',
  PluginError: 'platform.plugin.error',

  // Health
  HealthCheckCompleted: 'platform.health.completed',
} as const;

// ─── Event Payloads ──────────────────────────────────────────────────────────

export interface ExtensionActivatedPayload {
  readonly activationTime: number;
  readonly servicesLoaded: number;
  readonly commandsRegistered: number;
}

export interface ExtensionDeactivatingPayload {
  readonly reason: string;
}

export interface ServiceInitializedPayload {
  readonly serviceName: string;
  readonly duration: number;
}

export interface ServiceDisposedPayload {
  readonly serviceName: string;
}

export interface ServiceErrorPayload {
  readonly serviceName: string;
  readonly error: string;
  readonly code?: string;
}

export interface ConfigurationChangedPayload {
  readonly key: string;
  readonly oldValue: unknown;
  readonly newValue: unknown;
}

export interface CommandExecutedPayload {
  readonly commandId: string;
  readonly duration: number;
  readonly success: boolean;
  readonly error?: string;
}

export interface PluginLoadedPayload {
  readonly pluginId: string;
  readonly version: string;
  readonly capabilities: ReadonlyArray<string>;
}

export interface PluginUnloadedPayload {
  readonly pluginId: string;
  readonly reason: string;
}

export interface HealthCheckPayload {
  readonly overall: string;
  readonly services: ReadonlyArray<{
    readonly name: string;
    readonly status: string;
    readonly message: string;
  }>;
}
