/**
 * Service errors (AS-9xxx).
 */

import { AutomationStudioError, type ErrorContext, type ErrorRecovery } from './base-error';

export class ServiceError extends AutomationStudioError {
  constructor(
    message: string,
    options?: {
      cause?: Error;
      context?: ErrorContext;
      recovery?: ErrorRecovery;
    },
  ) {
    super('AS-9000', message, options);
  }
}

export class ServiceInitializationError extends AutomationStudioError {
  constructor(
    serviceName: string,
    options?: { cause?: Error; context?: ErrorContext },
  ) {
    super('AS-9001', `Service initialization failed: ${serviceName}`, {
      ...options,
      context: { serviceName, ...options?.context },
      recovery: {
        suggestion: `Check the logs for details about why '${serviceName}' failed to initialize.`,
      },
    });
  }
}

export class ServiceNotReadyError extends AutomationStudioError {
  constructor(
    serviceName: string,
    options?: { context?: ErrorContext },
  ) {
    super('AS-9002', `Service not ready: ${serviceName}`, {
      ...options,
      context: { serviceName, ...options?.context },
      recovery: {
        suggestion: `Wait for '${serviceName}' to finish initialization before calling this method.`,
      },
    });
  }
}
