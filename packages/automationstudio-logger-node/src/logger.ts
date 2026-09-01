/**
 * Structured JSON logger implementation.
 * Supports scoped child loggers, correlation IDs, timing, and secret redaction.
 */

import type {
  ILogger,
  ILogSink,
  LogEntry,
  LogLevel as LogLevelType,
  CorrelationId,
  Timestamp,
} from '@automation-studio/types';
import { LogLevel } from '@automation-studio/types';
import { generateUUID } from '@automation-studio/shared';

const DEFAULT_REDACTION_PATTERNS = [
  /password['":\s]*['"]\s*[^'"]+['"]/gi,
  /secret['":\s]*['"]\s*[^'"]+['"]/gi,
  /token['":\s]*['"]\s*[^'"]+['"]/gi,
  /api[_-]?key['":\s]*['"]\s*[^'"]+['"]/gi,
  /authorization['":\s]*['"]\s*[^'"]+['"]/gi,
];

export class Logger implements ILogger {
  public readonly scope: string;
  private level: LogLevelType;
  private readonly sinks: ILogSink[];
  private readonly correlationId?: CorrelationId;
  private readonly timers: Map<string, number> = new Map();
  private readonly redactionPatterns: RegExp[];
  private readonly options: {
    level?: LogLevelType;
    correlationId?: CorrelationId;
    redactionPatterns?: RegExp[];
    developerMode?: 'normal' | 'developer' | 'diagnostic';
  };

  constructor(
    scope: string,
    sinks: ILogSink[],
    options?: {
      level?: LogLevelType;
      correlationId?: CorrelationId;
      redactionPatterns?: RegExp[];
      developerMode?: 'normal' | 'developer' | 'diagnostic';
    },
  ) {
    this.scope = scope;
    this.sinks = sinks;
    this.options = options || {};
    this.level = this.options.level ?? LogLevel.Info;
    this.correlationId = this.options.correlationId;
    this.redactionPatterns = this.options.redactionPatterns ?? DEFAULT_REDACTION_PATTERNS;
  }

  public trace(message: string, data?: Record<string, unknown>): void {
    this.log(LogLevel.Trace, message, undefined, data);
  }

  public debug(message: string, data?: Record<string, unknown>): void {
    this.log(LogLevel.Debug, message, undefined, data);
  }

  public info(message: string, data?: Record<string, unknown>): void {
    this.log(LogLevel.Info, message, undefined, data);
  }

  public warn(message: string, data?: Record<string, unknown>): void {
    this.log(LogLevel.Warn, message, undefined, data);
  }

  public error(message: string, error?: Error, data?: Record<string, unknown>): void {
    this.log(LogLevel.Error, message, error, data);
  }

  public fatal(message: string, error?: Error, data?: Record<string, unknown>): void {
    this.log(LogLevel.Fatal, message, error, data);
  }

  public child(scope: string, correlationId?: CorrelationId): ILogger {
    return new Logger(`${this.scope}.${scope}`, this.sinks, {
      ...this.options,
      correlationId: correlationId ?? this.correlationId,
    });
  }

  public time(label: string): void {
    this.timers.set(label, performance.now());
  }

  public timeEnd(label: string): number {
    const start = this.timers.get(label);
    if (start === undefined) {
      this.warn(`Timer '${label}' does not exist`);
      return 0;
    }
    this.timers.delete(label);
    const duration = performance.now() - start;
    this.debug(`${label}: ${duration.toFixed(2)}ms`, { duration });
    return duration;
  }

  public setLevel(level: LogLevelType): void {
    this.level = level;
  }

  public getLevel(): LogLevelType {
    return this.level;
  }

  public addSink(sink: ILogSink): void {
    this.sinks.push(sink);
  }

  public async flush(): Promise<void> {
    await Promise.all(this.sinks.map((sink) => sink.flush()));
  }

  private log(
    level: LogLevelType,
    message: string,
    error?: Error,
    data?: Record<string, unknown>,
  ): void {
    if (level < this.level) {
      return;
    }

    const mode = this.options.developerMode;
    if (mode !== undefined) {
      if (mode === 'normal' && level < LogLevel.Info) {
        return;
      }
      if (mode === 'developer' && level < LogLevel.Debug) {
        return;
      }
      if (mode !== 'diagnostic' && level === LogLevel.Trace) {
        return;
      }
    }

    const entry: LogEntry = {
      level,
      message: this.redact(message),
      timestamp: Date.now() as Timestamp,
      scope: this.scope,
      correlationId: this.correlationId,
      data: data ? this.redactData(data) : undefined,
      error: error
        ? {
            name: error.name,
            message: this.redact(error.message),
            stack: error.stack,
            code: 'code' in error ? String((error as Record<string, unknown>)['code']) : undefined,
          }
        : undefined,
    };

    for (const sink of this.sinks) {
      try {
        sink.write(entry);
      } catch {
        // Logging must never throw
      }
    }
  }

  private redact(value: string): string {
    let result = value;
    for (const pattern of this.redactionPatterns) {
      result = result.replace(pattern, '[REDACTED]');
    }
    return result;
  }

  private redactData(data: Record<string, unknown>): Record<string, unknown> {
    const redacted: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      if (typeof value === 'string') {
        redacted[key] = this.redact(value);
      } else {
        redacted[key] = value;
      }
    }
    return redacted;
  }
}
