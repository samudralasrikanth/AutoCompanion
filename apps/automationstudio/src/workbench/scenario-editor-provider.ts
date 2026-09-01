import * as vscode from 'vscode';
import { join } from 'path';
import { readFileSync } from 'fs';
import { ScenarioDiff } from '@automation-studio/sdk';
import type { IScenario } from '@automation-studio/sdk';

export class ScenarioEditorProvider implements vscode.CustomTextEditorProvider {
  public static readonly viewType = 'automationStudio.scenarioEditor';

  constructor(private readonly extensionUri: vscode.Uri) {}

  public async resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
    token: vscode.CancellationToken
  ): Promise<void> {
    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri]
    };
    webviewPanel.webview.html = this.getWebviewContent();

    let previousScenario: IScenario | undefined;
    const differ = new ScenarioDiff();

    function updateWebview() {
      const text = document.getText();
      let diffs: any[] = [];
      try {
        const currentScenario = JSON.parse(text) as IScenario;
        if (previousScenario) {
          diffs = differ.compute(previousScenario, currentScenario);
        }
        previousScenario = currentScenario;
      } catch (e) {
        // invalid JSON
      }

      webviewPanel.webview.postMessage({
        type: 'update',
        text,
        diffs
      });
    }

    const changeDocumentSubscription = vscode.workspace.onDidChangeTextDocument(e => {
      if (e.document.uri.toString() === document.uri.toString()) {
        updateWebview();
      }
    });

    webviewPanel.onDidDispose(() => {
      changeDocumentSubscription.dispose();
    });

    webviewPanel.webview.onDidReceiveMessage(e => {
      switch (e.type) {
        case 'save':
          this.updateTextDocument(document, e.text);
          return;
        case 'generate':
          document.save().then(() => {
            vscode.commands.executeCommand('automationStudio.project.build', document.uri);
          });
          return;
      }
    });

    updateWebview();
  }

  private updateTextDocument(document: vscode.TextDocument, jsonString: string) {
    const edit = new vscode.WorkspaceEdit();
    edit.replace(
      document.uri,
      new vscode.Range(0, 0, document.lineCount, 0),
      jsonString
    );
    return vscode.workspace.applyEdit(edit);
  }

  private getWebviewContent(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
  <title>Scenario Editor</title>
  <style>
    body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: var(--vscode-editor-background); padding: 20px; }
    .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--vscode-widget-border); padding-bottom: 10px; margin-bottom: 20px; }
    .step-list { list-style: none; padding: 0; margin: 0; }
    .step-item { background: var(--vscode-editorWidget-background); border: 1px solid var(--vscode-widget-border); padding: 10px; margin-bottom: 10px; border-radius: 4px; display: flex; align-items: center; justify-content: space-between; }
    .step-item.disabled { opacity: 0.5; }
    .step-drag-handle { cursor: grab; padding-right: 10px; color: var(--vscode-descriptionForeground); }
    .step-content { flex: 1; }
    .step-type { font-weight: bold; color: var(--vscode-symbolIcon-methodForeground); margin-right: 10px; text-transform: uppercase; font-size: 12px; }
    .step-target { font-family: monospace; color: var(--vscode-symbolIcon-variableForeground); }
    .step-param { font-family: monospace; color: var(--vscode-symbolIcon-stringForeground); margin-left: 10px; }
    .step-actions button { background: none; border: none; color: var(--vscode-button-foreground); cursor: pointer; padding: 4px; margin-left: 5px; }
    .step-actions button:hover { background: var(--vscode-toolbar-hoverBackground); }
    button.primary { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; padding: 6px 12px; cursor: pointer; border-radius: 2px; }
    button.primary:hover { background: var(--vscode-button-hoverBackground); }
  </style>
</head>
<body>
  <div class="header">
    <h2 id="scenario-name">Scenario</h2>
    <div>
      <button class="primary" onclick="generateCode()">Generate Python</button>
    </div>
  </div>
  
  <div id="diffs" style="color: var(--vscode-charts-purple); margin-bottom: 20px; font-weight: bold;"></div>
  <div id="warnings" style="color: var(--vscode-charts-orange); margin-bottom: 20px;"></div>

  <h3>Variables</h3>
  <ul class="step-list" id="variables"></ul>

  <h3>Preconditions</h3>
  <ul class="step-list" id="preconditions"></ul>

  <h3>Main Flow</h3>
  <ul class="step-list" id="steps"></ul>

  <h3>Assertions</h3>
  <ul class="step-list" id="assertions"></ul>

  <h3>Recovery</h3>
  <ul class="step-list" id="recovery"></ul>

  <h3>Cleanup</h3>
  <ul class="step-list" id="cleanup"></ul>

  <script>
    const vscode = acquireVsCodeApi();
    let scenario = null;

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
      if (message.type === 'update') {
        const diffsContainer = document.getElementById('diffs');
        if (message.diffs && message.diffs.length > 0) {
          diffsContainer.innerHTML = '<h4>Recent Changes</h4><ul>' + message.diffs.map(d => \`<li>\${escapeHtml(d.description)}</li>\`).join('') + '</ul>';
        } else {
          diffsContainer.innerHTML = '';
        }

        try {
          scenario = JSON.parse(message.text);
          render();
        } catch (e) {
          document.getElementById('warnings').innerText = 'Invalid JSON: ' + e.message;
        }
      }
    });

    function render() {
      document.getElementById('warnings').innerText = '';
      if (!scenario) return;
      document.getElementById('scenario-name').innerText = scenario.name || 'Untitled Scenario';
      
      const renderStepList = (containerId, stepsArray, sectionName) => {
        const container = document.getElementById(containerId);
        container.innerHTML = '';
        (stepsArray || []).forEach((step, index) => {
          const li = document.createElement('li');
          li.className = \`step-item \${step.disabled ? 'disabled' : ''}\`;
          
          let paramStr = '';
          if (step.parameters && step.parameters.length > 0) {
            paramStr = step.parameters.map(p => \`<span class="step-param">\${escapeHtml(p.name)}: "\${escapeHtml(p.value)}"</span>\`).join(', ');
          }

          li.innerHTML = \`
            <div class="step-drag-handle">☰</div>
            <div class="step-content">
              <span class="step-type">\${escapeHtml(step.type)}</span>
              \${step.target ? \`<span class="step-target">\${escapeHtml(step.target)}</span>\` : ''}
              \${paramStr}
            </div>
            <div class="step-actions">
              <button onclick="replayFrom('\${sectionName}', \${index})">Replay From Here</button>
              <button onclick="toggleDisable('\${sectionName}', \${index})">\${step.disabled ? 'Enable' : 'Disable'}</button>
              <button onclick="deleteStep('\${sectionName}', \${index})" style="color: var(--vscode-charts-red);">Delete</button>
            </div>
          \`;
          container.appendChild(li);
        });
      };

      renderStepList('preconditions', scenario.preconditions, 'preconditions');
      renderStepList('steps', scenario.steps, 'steps');
      renderStepList('assertions', scenario.assertions, 'assertions');
      renderStepList('recovery', scenario.recovery, 'recovery');
      renderStepList('cleanup', scenario.cleanup, 'cleanup');

      const varsContainer = document.getElementById('variables');
      varsContainer.innerHTML = '';
      (scenario.variables || []).forEach((v, index) => {
        const li = document.createElement('li');
        li.className = 'step-item';
        li.innerHTML = \`
          <div class="step-content">
            <span class="step-target">\${escapeHtml(v.name)}</span> <span class="step-param">(\${escapeHtml(v.type)}) = \${escapeHtml(v.defaultValue || 'none')}</span>
          </div>
        \`;
        varsContainer.appendChild(li);
      });
    }

    function toggleDisable(section, index) {
      if (!scenario || !scenario[section]) return;
      scenario[section][index].disabled = !scenario[section][index].disabled;
      save();
    }

    function deleteStep(section, index) {
      if (!scenario || !scenario[section]) return;
      scenario[section].splice(index, 1);
      save();
    }

    function replayFrom(section, index) {
      vscode.postMessage({ type: 'replay', section, index });
    }

    function save() {
      vscode.postMessage({ type: 'save', text: JSON.stringify(scenario, null, 2) });
    }

    function generateCode() {
      vscode.postMessage({ type: 'generate' });
    }
  </script>
</body>
</html>`;
  }
}
