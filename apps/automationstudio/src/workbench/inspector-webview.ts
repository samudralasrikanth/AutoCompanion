import * as vscode from 'vscode';
import { join } from 'path';
import { readFileSync } from 'fs';
import type { TechnologyRegistry } from '@automation-studio/registry';
import type { PluginLoader } from '@automation-studio/registry';
import type { IInspector, InspectSession, InspectResult } from '@automation-studio/inspector';
import { LocatorEngine } from '@automation-studio/inspector';
import { FileSystemRepository } from '@automation-studio/sdk';
import type { IScenario, IStep } from '@automation-studio/sdk';
import type { IWorkspaceService } from '@automation-studio/types';

import * as fs from 'fs';

export class InspectorWebview {
  public static readonly viewType = 'automationStudio.inspectorView';

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly registry: TechnologyRegistry
  ) {}

  public async startInspector(): Promise<void> {
    // Determine the target technology from the active project
    let targetTechnology = 'vision'; // default fallback
    const workspaceFolders = vscode.workspace.workspaceFolders;
    const folder = workspaceFolders?.[0];
    if (folder) {
      const projectPath = join(folder.uri.fsPath, 'project.json');
      if (fs.existsSync(projectPath)) {
        try {
          const projectData = JSON.parse(fs.readFileSync(projectPath, 'utf8'));
          if (projectData.technology) {
            targetTechnology = projectData.technology;
          }
        } catch (e) {
          console.warn('Failed to parse project.json for technology:', e);
        }
      }
    }

    const adapters = this.registry.resolveByCapability('inspector');
    // Find the one matching targetTechnology, or fallback to first
    const adapter = adapters.find((a: any) => a.metadata?.technology === targetTechnology) || adapters[0];
    
    if (!adapter) {
      vscode.window.showErrorMessage('No inspector capability available.');
      return;
    }
    
    // Create the framework and extract the inspector
    const framework = adapter.createFramework() as any;
    // ensure initialized since createSession relies on it being ready
    await framework.initialize();
    
    if (!framework.inspector) {
      vscode.window.showErrorMessage('Plugin adapter does not expose an inspector.');
      return;
    }
    const inspectorCapability = framework.inspector as IInspector;

    const panel = vscode.window.createWebviewPanel(
      InspectorWebview.viewType,
      'Automation Inspector',
      vscode.ViewColumn.Two,
      {
        enableScripts: true,
        localResourceRoots: [this.extensionUri]
      }
    );

    panel.webview.html = this.getWebviewContent();

    const session = await inspectorCapability.createSession();
    const locatorEngine = new LocatorEngine();

    session.onElementSelected((result: InspectResult) => {
      const candidates = locatorEngine.generateCandidates(result.metadata);
      
      panel.webview.postMessage({
        command: 'elementSelected',
        metadata: result.metadata,
        candidates
      });
    });

    session.onDisconnected(() => {
      panel.webview.postMessage({ command: 'disconnected' });
    });

    panel.webview.onDidReceiveMessage(async (message) => {
      switch (message.command) {
        case 'highlight':
          await session.highlight(message.strategy, message.value);
          break;
        case 'addToRepository':
          const rootPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
          if (!rootPath) {
            vscode.window.showErrorMessage('No active workspace to save Object Repository.');
            break;
          }
          const repo = new FileSystemRepository(rootPath);
          await repo.saveObject({
            id: message.name,
            name: message.name,
            folderPath: 'Inspector',
            definition: {
              css: message.candidates.find((c: any) => c.strategy === 'css')?.value,
              xpath: message.candidates.find((c: any) => c.strategy === 'xpath')?.value,
              aria: message.candidates.find((c: any) => c.strategy === 'aria')?.value,
              text: message.candidates.find((c: any) => c.strategy === 'text')?.value,
              ocr: message.candidates.find((c: any) => c.strategy === 'ocr') ? { text: message.candidates.find((c: any) => c.strategy === 'ocr').value, type: 'exact' } : undefined,
            }
          });
          vscode.window.showInformationMessage(`Added ${message.name} to Object Repository!`);
          break;
        case 'action:stop':
          await session.stop();
          break;
        case 'action:refresh':
          await session.refresh();
          break;
        case 'action:exportDom':
          const dom = await session.exportDom();
          vscode.workspace.openTextDocument({ content: dom, language: 'html' }).then(doc => {
            vscode.window.showTextDocument(doc);
          });
          break;
      }
    });

    panel.onDidDispose(() => {
      session.stop();
    });
  }

  private getWebviewContent(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
  <title>Automation Inspector</title>
  <style>
    body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); background-color: var(--vscode-editor-background); padding: 10px; }
    .card { background-color: var(--vscode-editorWidget-background); border: 1px solid var(--vscode-widget-border); padding: 10px; margin-bottom: 10px; border-radius: 4px; }
    h3 { margin-top: 0; font-size: 14px; border-bottom: 1px solid var(--vscode-widget-border); padding-bottom: 5px; }
    .metadata-row { display: flex; justify-content: space-between; margin-bottom: 4px; font-size: 12px; }
    .locator-item { display: flex; align-items: center; justify-content: space-between; padding: 4px; background: var(--vscode-input-background); margin-bottom: 4px; border-radius: 2px; font-family: monospace; font-size: 11px; cursor: pointer; }
    .locator-item:hover { background: var(--vscode-list-hoverBackground); }
    .stars { color: #e3a826; }
    button { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; padding: 6px 10px; cursor: pointer; border-radius: 2px; width: 100%; margin-top: 5px; }
    button:hover { background: var(--vscode-button-hoverBackground); }
    .toolbar { display: flex; gap: 5px; margin-bottom: 10px; }
    .toolbar button { width: auto; flex: 1; margin-top: 0; }
    #disconnected-overlay { display: none; position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); color: white; justify-content: center; align-items: center; flex-direction: column; z-index: 1000; }
  </style>
</head>
<body>
  <div id="disconnected-overlay">
    <h2>Browser Disconnected</h2>
    <button onclick="location.reload()" style="width: auto;">Reconnect</button>
  </div>

  <div class="toolbar">
    <button onclick="sendCommand('action:refresh')">Refresh</button>
    <button onclick="sendCommand('action:exportDom')">DOM</button>
    <button onclick="sendCommand('action:stop')">Close</button>
  </div>

  <div class="card">
    <h3>Current Browser</h3>
    <div style="font-size: 12px;">Playwright (Chromium)</div>
  </div>

  <div class="card">
    <h3>Selected Element</h3>
    <div id="metadata-container">Hover over an element in the browser...</div>
  </div>

  <div class="card">
    <h3>Locator Suggestions</h3>
    <div id="locators-container">No element selected.</div>
  </div>

  <div class="card">
    <h3>Actions</h3>
    <button id="add-btn" disabled>Add to Repository</button>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    const metadataContainer = document.getElementById('metadata-container');
    const locatorsContainer = document.getElementById('locators-container');
    const addBtn = document.getElementById('add-btn');

    let currentSelection = null;
    
    function escapeHtml(unsafe) {
      return (unsafe || '').toString()
           .replace(/&/g, "&amp;")
           .replace(/</g, "&lt;")
           .replace(/>/g, "&gt;")
           .replace(/"/g, "&quot;")
           .replace(/'/g, "&#039;");
    }

    window.addEventListener('message', event => {
      const message = event.data;
      if (message.command === 'elementSelected') {
        currentSelection = message;
        
        // Update Metadata
        metadataContainer.innerHTML = \`
          <div class="metadata-row"><strong>Tag:</strong> <span>\${escapeHtml(message.metadata.tagName)}</span></div>
          <div class="metadata-row"><strong>ID:</strong> <span>\${escapeHtml(message.metadata.id || '-')}</span></div>
          <div class="metadata-row"><strong>Text:</strong> <span>\${escapeHtml(message.metadata.text || '-')}</span></div>
        \`;

        // Update Locators
        locatorsContainer.innerHTML = message.candidates.map(c => {
          const stars = '★'.repeat(Math.round(c.confidence / 20)) + '☆'.repeat(5 - Math.round(c.confidence / 20));
          return \`
            <div class="locator-item" data-strategy="\${escapeHtml(c.strategy)}" data-value="\${escapeHtml(c.value)}">
              <span><span class="stars">\${stars}</span> \${escapeHtml(c.strategy)}</span>
              <span style="opacity: 0.7; margin-left: 10px; text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">\${escapeHtml(c.value)}</span>
            </div>
          \`;
        }).join('');

        addBtn.disabled = false;
      } else if (message.command === 'disconnected') {
        document.getElementById('disconnected-overlay').style.display = 'flex';
      } else if (message.command === 'recordingStarted') {
        document.getElementById('record-btn').innerText = '⏹ Stop Recording';
        document.getElementById('record-btn').setAttribute('onclick', "sendCommand('action:stopRecord')");
      } else if (message.command === 'recordingStopped') {
        document.getElementById('record-btn').innerText = '● Record';
        document.getElementById('record-btn').setAttribute('onclick', "sendCommand('action:record')");
      }
    });

    locatorsContainer.addEventListener('click', e => {
      const item = e.target.closest('.locator-item');
      if (item) {
        const strategy = item.getAttribute('data-strategy');
        const value = item.getAttribute('data-value');
        highlightLocator(strategy, value);
      }
    });

    addBtn.addEventListener('click', () => {
      if (currentSelection) {
        vscode.postMessage({
          command: 'addToRepository',
          name: currentSelection.metadata.id || currentSelection.metadata.tagName + 'Element',
          candidates: currentSelection.candidates
        });
      }
    });

    function highlightLocator(strategy, value) {
      vscode.postMessage({ command: 'highlight', strategy, value });
    }

    function sendCommand(cmd) {
      vscode.postMessage({ command: cmd });
    }
  </script>
</body>
</html>`;
  }
}
