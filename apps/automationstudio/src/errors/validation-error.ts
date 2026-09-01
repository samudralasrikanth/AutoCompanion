/**
 * Validation errors (AS-8xxx).
 */

import { AutomationStudioError, type ErrorContext, type ErrorRecovery } from './base-error';

export class ValidationError extends AutomationStudioError {
  constructor(
    message: string,
    options?: {
      cause?: Error;
      context?: ErrorContext;
      recovery?: ErrorRecovery;
    },
  ) {
    super('AS-8000', message, options);
  }
}

export class SchemaValidationError extends AutomationStudioError {
  public readonly violations: ReadonlyArray<string>;

  constructor(
    schemaName: string,
    violations: ReadonlyArray<string>,
    options?: { cause?: Error; context?: ErrorContext },
  ) {
    super(
      'AS-8001',
      `Schema validation failed for '${schemaName}': ${violations.length} violation(s)`,
      {
        ...options,
        context: { schemaName, violations: [...violations], ...options?.context },
        recovery: {
          suggestion: `Fix the following issues in '${schemaName}':\n${violations.map((v) => `  - ${v}`).join('\n')}`,
        },
      },
    );
    this.violations = violations;
  }
}

export class InputValidationError extends AutomationStudioError {
  constructor(
    field: string,
    reason: string,
    options?: { cause?: Error; context?: ErrorContext },
  ) {
    super('AS-8002', `Invalid input for '${field}': ${reason}`, {
      ...options,
      context: { field, reason, ...options?.context },
      recovery: {
        suggestion: `Please provide a valid value for '${field}'.`,
      },
    });
  }
}
