/**
 * JSON log sink - structured JSON output for each log entry.
 * Writes to any writable stream or collects in memory for testing.
 */

import type { ILogSink, LogEntry } from '@automation-studio/types';

export class JsonSink implements ILogSink {
  public readonly name = 'JsonSink';
  private readonly entries: string[] = [];
  private readonly writer?: (line: string) => void;

  constructor(writer?: (line: string) => void) {
    this.writer = writer;
  }

  public write(entry: LogEntry): void {
    const json = JSON.stringify(entry);
    if (this.writer) {
      this.writer(json);
    } else {
      this.entries.push(json);
    }
  }

  public async flush(): Promise<void> {
    // No buffering needed
  }

  public dispose(): void {
    this.entries.length = 0;
  }

  public getEntries(): ReadonlyArray<string> {
    return [...this.entries];
  }
}
