/**
 * Console log sink - for development and testing.
 */

import type { ILogSink, LogEntry } from '@automation-studio/types';
import { LOG_LEVEL_NAMES } from '@automation-studio/types';

export class ConsoleSink implements ILogSink {
  public readonly name = 'ConsoleSink';

  public write(entry: LogEntry): void {
    const line = this.format(entry);
    if (entry.level >= 4) {
      // eslint-disable-next-line no-console
      console.error(line);
    } else if (entry.level >= 3) {
      // eslint-disable-next-line no-console
      console.warn(line);
    } else {
      // eslint-disable-next-line no-console
      console.log(line);
    }
  }

  public async flush(): Promise<void> {
    // Console flush is a no-op
  }

  public dispose(): void {
    // Nothing to dispose
  }

  private format(entry: LogEntry): string {
    const timestamp = new Date(entry.timestamp).toISOString();
    const level = LOG_LEVEL_NAMES[entry.level] ?? 'UNKNOWN';
    const parts = [`[${timestamp}]`, `[${level}]`, `[${entry.scope}]`, entry.message];

    if (entry.correlationId) {
      parts.splice(3, 0, `[${entry.correlationId}]`);
    }

    if (entry.data) {
      parts.push(JSON.stringify(entry.data));
    }

    if (entry.error) {
      parts.push(`\n  Error: ${entry.error.name}: ${entry.error.message}`);
      if (entry.error.stack) {
        parts.push(`\n  Stack: ${entry.error.stack}`);
      }
    }

    return parts.join(' ');
  }
}
