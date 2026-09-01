/**
 * Core runtime errors for the Automation Runtime Engine.
 */

export class RuntimeError extends Error {
  public readonly code: string;
  public readonly context?: Record<string, unknown>;

  constructor(message: string, code: string, context?: Record<string, unknown>) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.context = context;
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

export class ExecutionError extends RuntimeError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'ERR_EXECUTION', context);
  }
}

export class FrameworkError extends RuntimeError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'ERR_FRAMEWORK', context);
  }
}

export class AssertionError extends RuntimeError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'ERR_ASSERTION', context);
  }
}

export class TimeoutError extends RuntimeError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'ERR_TIMEOUT', context);
  }
}

export class PluginError extends RuntimeError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'ERR_PLUGIN', context);
  }
}

export class CancellationError extends RuntimeError {
  constructor(message: string = 'Execution was cancelled') {
    super(message, 'ERR_CANCELLED');
  }
}

export class ValidationError extends RuntimeError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'ERR_VALIDATION', context);
  }
}
