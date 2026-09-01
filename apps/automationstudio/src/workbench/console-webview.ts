import * as vscode from 'vscode';
import type { IEventBus, ILogSink, LogEntry } from '@automation-studio/types';
import { LOG_LEVEL_NAMES } from '@automation-studio/types';

export class ConsoleWebviewViewProvider implements vscode.WebviewViewProvider, ILogSink {
  public static readonly viewType = 'automationStudio.consoleView';
  public readonly name = 'ConsoleWebview';
  private view?: vscode.WebviewView;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly eventBus: IEventBus
  ) {}

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri]
    };

    webviewView.webview.html = this.getHtmlForWebview();

    webviewView.webview.onDidReceiveMessage(message => {
      switch (message.command) {
        case 'clear':
          // Handle clear if needed
          break;
        case 'export':
          this.exportLogs(message.logs);
          break;
      }
    });

    // We should intercept VSCodeOutputChannelSink logs or just read from EventBus if logs were pushed there.
    // Since we don't have a direct log event bus currently, we can mock streaming.
  }

  public write(entry: LogEntry): void {
    const levelStr = LOG_LEVEL_NAMES[entry.level].padEnd(5, ' ');
    const category = entry.scope || 'Core';
    let message = `[${levelStr}] [${category}] ${entry.message}`;

    if (entry.data && Object.keys(entry.data).length > 0) {
      message += ` ${JSON.stringify(entry.data)}`;
    }
    if (entry.error) {
      message += `\n${entry.error.name}: ${entry.error.message}`;
      if (entry.error.stack) {
        message += `\n${entry.error.stack}`;
      }
    }

    if (this.view) {
      this.view.webview.postMessage({ type: 'log', data: message });
    } else {
      // Buffer if view isn't open? For now, we skip if view is not visible.
    }
  }

  public async flush(): Promise<void> {}
  
  public show(): void {
    vscode.commands.executeCommand(`${ConsoleWebviewViewProvider.viewType}.focus`);
  }

  public dispose(): void {}

  private async exportLogs(logs: string): Promise<void> {
    const uri = await vscode.window.showSaveDialog({
      filters: { 'Log files': ['log', 'txt'] },
      defaultUri: vscode.Uri.file('execution.log')
    });

    if (uri) {
      await vscode.workspace.fs.writeFile(uri, Buffer.from(logs, 'utf8'));
      vscode.window.showInformationMessage('Logs exported successfully');
    }
  }

  private getHtmlForWebview(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline' https:; script-src 'unsafe-inline' https:; img-src https: data:; font-src https: data:;">
  <title>Output Console</title>
  <style>
    body { font-family: var(--vscode-editor-font-family); font-size: 12px; padding: 0; margin: 0; background-color: var(--vscode-editor-background); color: var(--vscode-editor-foreground); display: flex; flex-direction: column; height: 100vh; }
    .toolbar { display: flex; gap: 8px; padding: 4px 8px; background-color: var(--vscode-sideBar-background); border-bottom: 1px solid var(--vscode-widget-border); align-items: center; }
    input.search { background-color: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); padding: 4px; border-radius: 2px; flex-grow: 1; }
    button { background-color: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; padding: 4px 8px; cursor: pointer; border-radius: 2px; }
    button:hover { background-color: var(--vscode-button-hoverBackground); }
    .logs { flex-grow: 1; overflow-y: auto; padding: 8px; white-space: pre-wrap; font-family: var(--vscode-editor-font-family); }
    .log-entry { margin-bottom: 2px; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 2px; }
    .error { color: var(--vscode-errorForeground); }
    .warn { color: var(--vscode-editorWarning-foreground); }
    .info { color: var(--vscode-editorInfo-foreground); }
  </style>
</head>
<body>
  <div class="toolbar">
    <input type="text" id="search" class="search" placeholder="Filter logs...">
    <button id="clearBtn">Clear</button>
    <button id="exportBtn">Export</button>
  </div>
  <div class="logs" id="logs"></div>

  <script>
    const vscode = acquireVsCodeApi();
    const logsContainer = document.getElementById('logs');
    const searchInput = document.getElementById('search');
    let allLogs = [];

    window.addEventListener('message', event => {
      const message = event.data;
      if (message.type === 'log') {
        const line = message.data;
        allLogs.push(line);
        renderLog(line);
        logsContainer.scrollTop = logsContainer.scrollHeight;
      }
    });

    function renderLog(line) {
      if (searchInput.value && !line.toLowerCase().includes(searchInput.value.toLowerCase())) {
        return;
      }
      const el = document.createElement('div');
      el.className = 'log-entry';
      if (line.includes('[ERROR]')) el.classList.add('error');
      else if (line.includes('[WARN]')) el.classList.add('warn');
      else if (line.includes('[INFO]')) el.classList.add('info');
      el.textContent = line;
      logsContainer.appendChild(el);
    }

    searchInput.addEventListener('input', () => {
      logsContainer.innerHTML = '';
      allLogs.forEach(renderLog);
    });

    document.getElementById('clearBtn').addEventListener('click', () => {
      allLogs = [];
      logsContainer.innerHTML = '';
      vscode.postMessage({ command: 'clear' });
    });

    document.getElementById('exportBtn').addEventListener('click', () => {
      vscode.postMessage({ command: 'export', logs: allLogs.join('\\n') });
    });
  </script>
</body>
</html>`;
  }
}
