/**
 * Project errors (AS-1xxx).
 */

import { AutomationStudioError, type ErrorContext, type ErrorRecovery } from './base-error';

export class ProjectError extends AutomationStudioError {
  constructor(
    message: string,
    options?: {
      cause?: Error;
      context?: ErrorContext;
      recovery?: ErrorRecovery;
    },
  ) {
    super('AS-1000', message, options);
  }
}

export class ProjectNotFoundError extends AutomationStudioError {
  constructor(path: string, options?: { cause?: Error; context?: ErrorContext }) {
    super('AS-1001', `Project not found at path: ${path}`, {
      ...options,
      context: { path, ...options?.context },
      recovery: {
        suggestion: 'Verify the project path exists and contains a valid project.json file.',
      },
    });
  }
}

export class ProjectAlreadyExistsError extends AutomationStudioError {
  constructor(path: string, options?: { context?: ErrorContext }) {
    super('AS-1002', `A project already exists at: ${path}`, {
      ...options,
      context: { path, ...options?.context },
      recovery: {
        suggestion: 'Choose a different location or delete the existing project first.',
      },
    });
  }
}

export class ProjectCorruptedError extends AutomationStudioError {
  constructor(path: string, reason: string, options?: { cause?: Error; context?: ErrorContext }) {
    super('AS-1003', `Project is corrupted at '${path}': ${reason}`, {
      ...options,
      context: { path, reason, ...options?.context },
      recovery: {
        suggestion: 'Try running project validation and repair. Check git history for recoverable versions.',
      },
    });
  }
}

export class ProjectMigrationError extends AutomationStudioError {
  constructor(
    fromVersion: number,
    toVersion: number,
    reason: string,
    options?: { cause?: Error; context?: ErrorContext },
  ) {
    super('AS-1004', `Migration from v${fromVersion} to v${toVersion} failed: ${reason}`, {
      ...options,
      context: { fromVersion, toVersion, reason, ...options?.context },
      recovery: {
        suggestion: 'The migration has been rolled back. Check the migration report for details.',
      },
    });
  }
}

export class ProjectTemplateError extends AutomationStudioError {
  constructor(templateId: string, reason: string, options?: { cause?: Error; context?: ErrorContext }) {
    super('AS-1005', `Template '${templateId}' error: ${reason}`, {
      ...options,
      context: { templateId, reason, ...options?.context },
      recovery: {
        suggestion: 'Ensure the template is valid and compatible with the current Studio version.',
      },
    });
  }
}
