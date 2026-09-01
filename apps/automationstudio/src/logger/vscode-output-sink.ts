import type * as vscode from 'vscode';
import { type ILogSink, type LogEntry, LOG_LEVEL_NAMES } from '@automation-studio/types';

export class VSCodeOutputChannelSink implements ILogSink {
  public readonly name = 'VSCodeOutput';
  
  constructor(private readonly channel: vscode.OutputChannel) {}

  public write(entry: LogEntry): void {
    const levelStr = LOG_LEVEL_NAMES[entry.level].padEnd(5, ' ');
    const category = entry.scope || 'Core';
    
    // Format: INFO  [Project] Platform Started
    let message = `${levelStr} [${category}] ${entry.message}`;

    if (entry.data && Object.keys(entry.data).length > 0) {
      message += ` ${JSON.stringify(entry.data)}`;
    }
    if (entry.error) {
      message += `\\n${entry.error.name}: ${entry.error.message}`;
      if (entry.error.stack) {
        message += `\\n${entry.error.stack}`;
      }
    }

    this.channel.appendLine(message);
  }

  public async flush(): Promise<void> {
    // VS Code output channel is synchronous
  }

  public dispose(): void {
    this.channel.dispose();
  }

  public show(): void {
    this.channel.show(true);
  }
}
