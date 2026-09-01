/**
 * Logging types.
 * Structured JSON logging with levels, sinks, correlation IDs, and scopes.
 */

import type { CorrelationId, Timestamp } from './common';

// ─── Log Level ───────────────────────────────────────────────────────────────

export enum LogLevel {
  Trace = 0,
  Debug = 1,
  Info = 2,
  Warn = 3,
  Error = 4,
  Fatal = 5,
}

export const LOG_LEVEL_NAMES: Record<LogLevel, string> = {
  [LogLevel.Trace]: 'TRACE',
  [LogLevel.Debug]: 'DEBUG',
  [LogLevel.Info]: 'INFO',
  [LogLevel.Warn]: 'WARN',
  [LogLevel.Error]: 'ERROR',
  [LogLevel.Fatal]: 'FATAL',
};

// ─── Log Entry ───────────────────────────────────────────────────────────────

export interface LogEntry {
  readonly level: LogLevel;
  readonly message: string;
  readonly timestamp: Timestamp;
  readonly scope: string;
  readonly correlationId?: CorrelationId;
  readonly data?: Record<string, unknown>;
  readonly error?: {
    readonly name: string;
    readonly message: string;
    readonly stack?: string;
    readonly code?: string;
  };
  readonly duration?: number;
}

// ─── Logger ──────────────────────────────────────────────────────────────────

export interface ILogger {
  readonly scope: string;

  trace(message: string, data?: Record<string, unknown>): void;
  debug(message: string, data?: Record<string, unknown>): void;
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, error?: Error, data?: Record<string, unknown>): void;
  fatal(message: string, error?: Error, data?: Record<string, unknown>): void;

  child(scope: string, correlationId?: CorrelationId): ILogger;

  time(label: string): void;
  timeEnd(label: string): number;

  setLevel(level: LogLevel): void;
  getLevel(): LogLevel;

  flush(): Promise<void>;
}

// ─── Log Sink ────────────────────────────────────────────────────────────────

export interface ILogSink {
  readonly name: string;

  write(entry: LogEntry): void;

  flush(): Promise<void>;

  dispose(): void;
}
