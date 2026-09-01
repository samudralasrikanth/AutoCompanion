/**
 * Configuration errors (AS-6xxx).
 */

import { AutomationStudioError, type ErrorContext, type ErrorRecovery } from './base-error';

export class ConfigurationError extends AutomationStudioError {
  constructor(
    message: string,
    options?: {
      cause?: Error;
      context?: ErrorContext;
      recovery?: ErrorRecovery;
    },
  ) {
    super('AS-6000', message, options);
  }
}

export class ConfigurationNotFoundError extends AutomationStudioError {
  constructor(key: string, options?: { cause?: Error; context?: ErrorContext }) {
    super('AS-6001', `Configuration key not found: ${key}`, {
      ...options,
      context: { key, ...options?.context },
      recovery: {
        suggestion: `Add the configuration key '${key}' to your settings.json or workspace settings.`,
        documentation: 'https://docs.automationstudio.dev/configuration',
      },
    });
  }
}

export class ConfigurationValidationError extends AutomationStudioError {
  constructor(key: string, reason: string, options?: { cause?: Error; context?: ErrorContext }) {
    super('AS-6002', `Invalid configuration value for '${key}': ${reason}`, {
      ...options,
      context: { key, reason, ...options?.context },
      recovery: {
        suggestion: `Check the value for '${key}' in your settings and ensure it matches the expected format.`,
      },
    });
  }
}
