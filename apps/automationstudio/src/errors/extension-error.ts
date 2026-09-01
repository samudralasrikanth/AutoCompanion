/**
 * Extension lifecycle errors (AS-5xxx).
 */

import { AutomationStudioError, type ErrorContext, type ErrorRecovery } from './base-error';

export class ExtensionError extends AutomationStudioError {
  constructor(
    message: string,
    options?: {
      cause?: Error;
      context?: ErrorContext;
      recovery?: ErrorRecovery;
    },
  ) {
    super('AS-5000', message, options);
  }
}

export class ActivationError extends AutomationStudioError {
  constructor(phase: string, options?: { cause?: Error; context?: ErrorContext }) {
    super('AS-5001', `Extension activation failed during phase: ${phase}`, {
      ...options,
      context: { phase, ...options?.context },
      recovery: {
        suggestion: 'Try reloading the VS Code window. If the issue persists, check the output logs.',
        action: 'workbench.action.reloadWindow',
      },
    });
  }
}

export class DeactivationError extends AutomationStudioError {
  constructor(message: string, options?: { cause?: Error; context?: ErrorContext }) {
    super('AS-5002', `Extension deactivation error: ${message}`, {
      ...options,
      recovery: {
        suggestion: 'This error occurred during shutdown. Data may not have been saved properly.',
      },
    });
  }
}

export class ServiceResolutionError extends AutomationStudioError {
  constructor(serviceName: string, options?: { cause?: Error; context?: ErrorContext }) {
    super('AS-5003', `Failed to resolve service: ${serviceName}`, {
      ...options,
      context: { serviceName, ...options?.context },
      recovery: {
        suggestion: `Ensure the service '${serviceName}' is registered in the DI container.`,
      },
    });
  }
}

export class CircularDependencyError extends AutomationStudioError {
  constructor(chain: ReadonlyArray<string>, options?: { context?: ErrorContext }) {
    const chainStr = chain.join(' → ');
    super('AS-5004', `Circular dependency detected: ${chainStr}`, {
      ...options,
      context: { chain: [...chain], ...options?.context },
      recovery: {
        suggestion: 'Break the circular dependency by using lazy resolution or restructuring service dependencies.',
      },
    });
  }
}
