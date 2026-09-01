import * as vscode from 'vscode';
import type { IEventBus, IServiceProvider } from '@automation-studio/types';
import { TYPES } from '../di/types';

import type { IWebviewHost, IWebviewPanel } from './workbench-types';

export class RuntimeMonitorWebview {
  private panel?: IWebviewPanel;
  private _subscriptions: any[] = [];
  private _disposables: vscode.Disposable[] = [];

  constructor(
    private readonly webviewHost: IWebviewHost,
    private readonly eventBus: IEventBus,
    private readonly logger: any
  ) {}

  public show(): void {
    this.panel = this.webviewHost.createOrShow({
      id: 'runtimeMonitor',
      title: 'Runtime Monitor',
      viewColumn: vscode.ViewColumn.One,
      enableScripts: true,
    });

    this.panel.updateHtml(this._getHtmlForWebview());

    this.panel.onDidReceiveMessage((message) => {
      if (message.command === 'cancel') {
        vscode.commands.executeCommand('automationStudio.stopExecution');
      } else if (message.command === 'pause') {
        vscode.window.showInformationMessage('Pause/Resume is managed via the VS Code Debug Toolbar during debugging.');
      }
    });

    this.panel.onDidDispose(() => {
      this.disposeSubscriptions();
    });

    // Clear any existing subscriptions before re-subscribing
    this.disposeSubscriptions();

    // Subscribe to event bus to push live updates to the webview
    const onEvent = (e: any) => {
      this.panel?.postMessage({ type: 'EVENT', data: e });
    };

    this._subscriptions.push(
      this.eventBus.subscribe('ScenarioStarted', onEvent),
      this.eventBus.subscribe('NodeStarted', onEvent),
      this.eventBus.subscribe('NodeFinished', onEvent),
      this.eventBus.subscribe('BreakpointHit', onEvent),
      this.eventBus.subscribe('ScenarioFinished', onEvent)
    );
  }

  private disposeSubscriptions(): void {
    while (this._subscriptions.length) {
      const sub = this._subscriptions.pop();
      if (sub) {
        try {
          this.eventBus.unsubscribe(sub);
        } catch (e) {
          this.logger.error('Failed to unsubscribe from EventBus', e);
        }
      }
    }
  }

  public dispose() {
    this.panel?.dispose();
    this.disposeSubscriptions();
    while (this._disposables.length) {
      const x = this._disposables.pop();
      if (x) {
        x.dispose();
      }
    }
  }

  private _getHtmlForWebview() {
    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline' https:; script-src 'unsafe-inline' https:; img-src https: data:; font-src https: data:;">
          <title>Runtime Monitor</title>
          <style>
              body { font-family: var(--vscode-font-family); color: var(--vscode-editor-foreground); padding: 20px; }
              .dashboard { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
              .card { background: var(--vscode-editor-background); padding: 15px; border: 1px solid var(--vscode-widget-border); border-radius: 6px; }
              .stat-row { display: flex; justify-content: space-between; padding: 5px 0; border-bottom: 1px solid var(--vscode-widget-border); }
              .stat-label { font-weight: bold; color: var(--vscode-descriptionForeground); }
              .progress-bar { width: 100%; height: 20px; background-color: var(--vscode-editorWidget-background); border-radius: 10px; overflow: hidden; margin-top: 10px; }
              .progress-fill { height: 100%; background-color: var(--vscode-progressBar-background); width: 0%; transition: width 0.3s; }
              .event-log { margin-top: 20px; max-height: 200px; overflow-y: auto; background: var(--vscode-editorWidget-background); padding: 10px; font-family: monospace; }
              .event-item { margin-bottom: 4px; }
              .pipeline { display: flex; gap: 10px; margin-bottom: 20px; }
              .stage { padding: 5px 10px; border-radius: 4px; background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); }
              .stage.active { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
              .stage.error { background: var(--vscode-errorForeground); color: white; }
              .actions { margin-top: 20px; display: flex; gap: 10px; }
              button { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; padding: 8px 12px; cursor: pointer; border-radius: 4px; }
              button:hover { background: var(--vscode-button-hoverBackground); }
          </style>
      </head>
      <body>
          <h2>Execution Monitor</h2>
          <div class="pipeline">
            <div class="stage active" id="stage-runtime">Runtime</div>
            <div class="stage" id="stage-executor">Executor</div>
            <div class="stage" id="stage-python">Python</div>
            <div class="stage" id="stage-ipc">IPC</div>
            <div class="stage" id="stage-reporter">Reporter</div>
          </div>
          
          <div class="dashboard">
            <div class="card">
                <h3>Metrics</h3>
                <div class="stat-row"><span class="stat-label">Status</span> <span id="val-status">Idle</span></div>
                <div class="stat-row"><span class="stat-label">Scenario</span> <span id="val-scenario">None</span></div>
                <div class="stat-row"><span class="stat-label">Step</span> <span id="val-step">None</span></div>
                <div class="stat-row"><span class="stat-label">Elapsed</span> <span id="val-elapsed">0s</span></div>
            </div>
          </div>

          <div class="progress-bar">
            <div class="progress-fill" id="progress"></div>
          </div>

          <div class="actions">
            <button onclick="cancel()">Cancel</button>
            <button onclick="pause()">Pause</button>
          </div>

          <h3>Recent Events</h3>
          <div class="event-log" id="events">
          </div>

          <script>
              const vscode = acquireVsCodeApi();
              
              let startTime = 0;
              let timerId = null;

              window.addEventListener('message', event => {
                  const message = event.data;
                  if (message.type === 'EVENT') {
                      const payload = message.data.payload;
                      const type = message.data.type;
                      
                      const el = document.createElement('div');
                      el.className = 'event-item';
                      el.innerText = \`[\${new Date().toLocaleTimeString()}] \${type}: \${payload.name || payload.path || ''}\`;
                      document.getElementById('events').prepend(el);

                      if (type === 'ScenarioStarted') {
                          document.getElementById('val-status').innerText = 'Running';
                          document.getElementById('val-scenario').innerText = payload?.path?.split('/').pop() || 'Unknown';
                          document.getElementById('progress').style.width = '10%';
                          document.getElementById('stage-executor').classList.add('active');
                          document.getElementById('stage-python').classList.add('active');
                          document.getElementById('stage-ipc').classList.add('active');
                          startTime = Date.now();
                          if(timerId) clearInterval(timerId);
                          timerId = setInterval(() => {
                              document.getElementById('val-elapsed').innerText = ((Date.now() - startTime) / 1000).toFixed(1) + 's';
                          }, 100);
                      } else if (type === 'NodeStarted') {
                          document.getElementById('val-step').innerText = message.data.nodeId || 'Unknown Node';
                      } else if (type === 'BreakpointHit') {
                          document.getElementById('val-status').innerText = 'Paused';
                      } else if (type === 'ScenarioFinished') {
                          document.getElementById('val-status').innerText = payload?.status === 'passed' ? 'Passed' : 'Failed';
                          document.getElementById('progress').style.width = '100%';
                          document.getElementById('stage-reporter').classList.add('active');
                          if(timerId) clearInterval(timerId);
                      }
                  }
              });

              function cancel() {
                  vscode.postMessage({ command: 'cancel' });
              }

              function pause() {
                  vscode.postMessage({ command: 'pause' });
              }
          </script>
      </body>
      </html>
    `;
  }
}
