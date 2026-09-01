export type LogLevel = 'TRACE' | 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'FATAL';

export interface LogEntry {
  timestamp: number;
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
}

export interface LogOutput {
  write(entry: LogEntry): void;
}

export class ConsoleOutput implements LogOutput {
  write(entry: LogEntry): void {
    const time = new Date(entry.timestamp).toISOString();
    const msg = `[${time}] [${entry.level}] ${entry.message}`;
    switch (entry.level) {
      case 'TRACE':
      case 'DEBUG':
        console.debug(msg, entry.context || '');
        break;
      case 'INFO':
        console.info(msg, entry.context || '');
        break;
      case 'WARN':
        console.warn(msg, entry.context || '');
        break;
      case 'ERROR':
      case 'FATAL':
        console.error(msg, entry.context || '');
        break;
    }
  }
}

export class LoggingFramework {
  private outputs: LogOutput[] = [new ConsoleOutput()];
  private minLevel: LogLevel = 'INFO';
  private logs: LogEntry[] = []; // In-memory sink

  private readonly levels: Record<LogLevel, number> = {
    TRACE: 0,
    DEBUG: 1,
    INFO: 2,
    WARN: 3,
    ERROR: 4,
    FATAL: 5
  };

  public setLevel(level: LogLevel): void {
    this.minLevel = level;
  }

  public addOutput(output: LogOutput): void {
    this.outputs.push(output);
  }

  public log(level: LogLevel, message: string, context?: Record<string, unknown>): void {
    if (this.levels[level] < this.levels[this.minLevel]) {
      return;
    }

    const entry: LogEntry = {
      timestamp: Date.now(),
      level,
      message,
      context
    };

    this.logs.push(entry);
    
    for (const output of this.outputs) {
      output.write(entry);
    }
  }

  public trace(msg: string, ctx?: Record<string, unknown>): void { this.log('TRACE', msg, ctx); }
  public debug(msg: string, ctx?: Record<string, unknown>): void { this.log('DEBUG', msg, ctx); }
  public info(msg: string, ctx?: Record<string, unknown>): void { this.log('INFO', msg, ctx); }
  public warn(msg: string, ctx?: Record<string, unknown>): void { this.log('WARN', msg, ctx); }
  public error(msg: string, ctx?: Record<string, unknown>): void { this.log('ERROR', msg, ctx); }
  public fatal(msg: string, ctx?: Record<string, unknown>): void { this.log('FATAL', msg, ctx); }
}
