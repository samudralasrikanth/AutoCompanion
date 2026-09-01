/**
 * Plugin errors (AS-7xxx).
 */

import { AutomationStudioError, type ErrorContext, type ErrorRecovery } from './base-error';

export class PluginError extends AutomationStudioError {
  constructor(
    message: string,
    options?: {
      cause?: Error;
      context?: ErrorContext;
      recovery?: ErrorRecovery;
    },
  ) {
    super('AS-7000', message, options);
  }
}

export class PluginNotFoundError extends AutomationStudioError {
  constructor(pluginId: string, options?: { cause?: Error; context?: ErrorContext }) {
    super('AS-7001', `Plugin not found: ${pluginId}`, {
      ...options,
      context: { pluginId, ...options?.context },
      recovery: {
        suggestion: `Check that the plugin '${pluginId}' is installed and its manifest is valid.`,
      },
    });
  }
}

export class PluginLoadError extends AutomationStudioError {
  constructor(pluginId: string, reason: string, options?: { cause?: Error; context?: ErrorContext }) {
    super('AS-7002', `Failed to load plugin '${pluginId}': ${reason}`, {
      ...options,
      context: { pluginId, reason, ...options?.context },
      recovery: {
        suggestion: `Try reinstalling the plugin '${pluginId}'. If the issue persists, check compatibility with the current Studio version.`,
      },
    });
  }
}

export class PluginVersionError extends AutomationStudioError {
  constructor(
    pluginId: string,
    requiredVersion: string,
    actualVersion: string,
    options?: { context?: ErrorContext },
  ) {
    super(
      'AS-7003',
      `Plugin '${pluginId}' version mismatch: requires ${requiredVersion}, found ${actualVersion}`,
      {
        ...options,
        context: { pluginId, requiredVersion, actualVersion, ...options?.context },
        recovery: {
          suggestion: `Update the plugin '${pluginId}' to version ${requiredVersion} or later.`,
        },
      },
    );
  }
}
