/**
 * Base error class for all Automation Studio errors.
 * Every error includes: code, message, cause, recovery suggestion, and context.
 */

export interface ErrorContext {
  readonly [key: string]: unknown;
}

export interface ErrorRecovery {
  readonly suggestion: string;
  readonly action?: string;
  readonly documentation?: string;
}

export abstract class AutomationStudioError extends Error {
  public override readonly name: string;
  public readonly code: string;
  public readonly timestamp: number;
  public readonly context: ErrorContext;
  public readonly recovery?: ErrorRecovery;

  constructor(
    code: string,
    message: string,
    options?: {
      cause?: Error;
      context?: ErrorContext;
      recovery?: ErrorRecovery;
    },
  ) {
    super(message, { cause: options?.cause });
    this.name = this.constructor.name;
    this.code = code;
    this.timestamp = Date.now();
    this.context = options?.context ?? {};
    this.recovery = options?.recovery;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  public toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      timestamp: this.timestamp,
      context: this.context,
      recovery: this.recovery,
      cause: this.cause instanceof Error
        ? {
            name: this.cause.name,
            message: this.cause.message,
            stack: this.cause.stack,
          }
        : undefined,
      stack: this.stack,
    };
  }

  public override toString(): string {
    let result = `[${this.code}] ${this.name}: ${this.message}`;
    if (this.recovery) {
      result += `\n  Recovery: ${this.recovery.suggestion}`;
    }
    if (this.cause instanceof Error) {
      result += `\n  Caused by: ${this.cause.message}`;
    }
    return result;
  }
}
