import * as vscode from 'vscode';
import type { IWebviewHost, IWebviewPanel } from './workbench-types';
import type { FrameworkManager } from '@automation-studio/registry';

export class FrameworkManagerWebview {
  private panel?: IWebviewPanel;
  private readonly webviewId = 'automationStudio.frameworkManagerView';

  constructor(
    private readonly webviewHost: IWebviewHost,
    private readonly frameworkManager: FrameworkManager
  ) {}

  public show(): void {
    this.panel = this.webviewHost.createOrShow({
      id: this.webviewId,
      title: 'Framework Manager',
      viewColumn: vscode.ViewColumn.Active,
      enableScripts: true,
    });

    this.panel.updateHtml(this.getHtml());

    this.panel.onDidReceiveMessage(async (message) => {
      if (message.command === 'install') {
        try {
          await this.frameworkManager.installFramework(message.id);
          vscode.window.showInformationMessage(`Successfully installed ${message.id}`);
          this.panel?.updateHtml(this.getHtml());
        } catch (err: any) {
          vscode.window.showErrorMessage(err.message);
        }
      } else if (message.command === 'uninstall') {
        try {
          await this.frameworkManager.uninstallFramework(message.id);
          vscode.window.showInformationMessage(`Successfully uninstalled ${message.id}`);
          this.panel?.updateHtml(this.getHtml());
        } catch (err: any) {
          vscode.window.showErrorMessage(err.message);
        }
      }
    });
  }

  private getHtml(): string {
    const frameworks = this.frameworkManager.getFrameworks();
    const installed = frameworks.filter(f => f.installed);
    const available = frameworks.filter(f => !f.installed);

    const renderCard = (f: any, isInstalled: boolean) => {
      let healthBadge = '';
      let metricsInfo = '';

      if (isInstalled && f.metrics) {
        const isHealthy = f.metrics.status === 'Healthy';
        const badgeColor = isHealthy ? 'bg-green-500/20 text-green-400 border-green-500/20' : 'bg-red-500/20 text-red-400 border-red-500/20';
        healthBadge = `<span class="text-[10px] ${badgeColor} px-2 py-0.5 rounded border ml-2">${f.metrics.status.toUpperCase()}</span>`;
        
        metricsInfo = `
          <div class="flex gap-4 mt-3 text-xs text-gray-400 bg-black/20 p-2 rounded">
            <div><span class="text-gray-500">Mem:</span> ${f.metrics.memoryMb ? f.metrics.memoryMb.toFixed(1) + ' MB' : 'N/A'}</div>
            <div><span class="text-gray-500">Start:</span> ${f.metrics.startupMs ? f.metrics.startupMs.toFixed(0) + ' ms' : 'N/A'}</div>
          </div>
        `;
      }

      return `
      <div class="glass-card rounded-lg p-4 flex justify-between items-center mb-3 transition-all hover:bg-white/5">
        <div class="flex-1">
          <div class="flex items-center gap-2">
            <h3 class="text-base font-semibold">${f.name}</h3>
            ${isInstalled ? '<span class="text-[10px] bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded border border-blue-500/20">INSTALLED</span>' : ''}
            ${healthBadge}
          </div>
          <p class="text-gray-400 text-xs mt-1">${f.description}</p>
          <div class="text-gray-500 text-[10px] mt-2 font-mono">v${f.version} | ID: ${f.id}</div>
          ${metricsInfo}
        </div>
        <div class="ml-4 flex flex-col gap-2">
          ${isInstalled 
            ? `
              <button onclick="uninstall('${f.id}')" class="px-3 py-1.5 text-xs text-red-400 hover:bg-red-400/10 rounded transition-colors w-full">Disable</button>
              <button onclick="uninstall('${f.id}')" class="px-3 py-1.5 text-xs text-gray-400 hover:bg-white/10 rounded transition-colors w-full">Uninstall</button>
              `
            : `<button onclick="install('${f.id}')" class="px-3 py-1.5 text-xs bg-primary-container text-white rounded hover:opacity-90 transition-opacity">Install</button>`
          }
        </div>
      </div>
      `;
    };

    return `<!DOCTYPE html>
<html class="dark" lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src https: data:; font-src https: data:;">
    <title>Framework Manager</title>
<script src="https://cdn.tailwindcss.com?plugins=forms,container-queries"></script>
<style>
  .glass-card {
      background: rgba(30, 32, 32, 0.7);
      backdrop-filter: blur(20px);
      border: 1px solid rgba(255, 255, 255, 0.08);
      box-shadow: 0 4px 30px rgba(0, 0, 0, 0.1);
  }
  body { background-color: var(--vscode-editor-background); color: var(--vscode-editor-foreground); font-family: var(--vscode-editor-font-family); }
</style>
</head>
<body class="p-8 max-w-4xl mx-auto">
  <div class="mb-8 border-b border-white/10 pb-4">
    <h1 class="text-3xl font-bold">Extension Marketplace</h1>
    <p class="text-gray-400 mt-2 text-sm">Discover and install automation framework plugins to extend the capabilities of Automation Studio.</p>
  </div>

  <div class="grid grid-cols-2 gap-8">
    <!-- Installed -->
    <div>
      <h2 class="text-lg font-semibold mb-4 text-white/90">Installed Modules</h2>
      ${installed.length > 0 ? installed.map(f => renderCard(f, true)).join('') : '<p class="text-gray-500 text-sm">No modules installed.</p>'}
    </div>

    <!-- Available -->
    <div>
      <h2 class="text-lg font-semibold mb-4 text-white/90">Available to Install</h2>
      ${available.length > 0 ? available.map(f => renderCard(f, false)).join('') : '<p class="text-gray-500 text-sm">All available modules are installed.</p>'}
    </div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    function install(id) {
      vscode.postMessage({ command: 'install', id });
    }
    function uninstall(id) {
      vscode.postMessage({ command: 'uninstall', id });
    }
  </script>
</body>
</html>`;
  }
}
