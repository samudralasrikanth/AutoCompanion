import * as vscode from 'vscode';
import type { IWebviewHost, IWebviewPanel } from './workbench-types';
import type { ProjectService } from '../services/project/project-service';

export class ReportWebview {
  private panel?: IWebviewPanel;
  private readonly webviewId = 'automationStudio.reportView';

  constructor(private readonly webviewHost: IWebviewHost, private readonly projectService?: ProjectService) {}

  public show(executionId: string): void {
    this.panel = this.webviewHost.createOrShow({
      id: this.webviewId,
      title: `Report: ${executionId.substring(0, 8)}`,
      viewColumn: vscode.ViewColumn.Active,
      enableScripts: true,
    });

    let reportData: any = null;
    const workspaceRoot = this.projectService?.manager.getCurrentProjectPath() || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (workspaceRoot) {
      const path = require('path') as typeof import('path');
      const fs = require('fs') as typeof import('fs');
      const reportPath = path.join(workspaceRoot, '.automationstudio', 'reports', executionId, 'report.json');
      if (reportPath) {
        try {
          reportData = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
        } catch (e) {
          console.error('Failed to parse report.json', e);
        }
      }
    }

    this.panel.updateHtml(this.getHtml(executionId, reportData));

    this.panel.onDidReceiveMessage((message) => {
      if (message.command === 'openScreenshot') {
        vscode.window.showInformationMessage(`Opening screenshot: ${message.path}`);
      }
      if (message.command === 'openHtmlReport' && reportData?.reportHtmlPath) {
        void vscode.commands.executeCommand('vscode.open', vscode.Uri.file(reportData.reportHtmlPath));
      }
    });
  }

  private getHtml(executionId: string, reportData: any): string {
    const escapeHtml = (unsafe: string) => {
      return (unsafe || '')
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    };
    const escapedId = escapeHtml(executionId);
    
    const statusText = (reportData?.status || 'passed').toUpperCase();
    const statusClass = statusText === 'FAILED' 
      ? 'bg-red-500/10 text-red-400 border-red-500/20' 
      : 'bg-green-500/10 text-green-400 border-green-500/20';

    const duration = reportData?.duration !== undefined
      ? `${(reportData.duration / 1000).toFixed(1)}s`
      : '45s';

    let stepsHtml = '';
    if (reportData && reportData.steps && reportData.steps.length > 0) {
      stepsHtml = reportData.steps.map((step: any, index: number) => {
        const passed = step.status === 'passed';
        return `<li class="relative">
          <span class="absolute -left-[23px] top-1 w-3 h-3 rounded-full ${passed ? 'bg-green-500' : 'bg-red-500'} ring-4 ring-surface"></span>
          <span class="font-bold">Step ${index + 1}:</span> ${escapeHtml(step.name)} <span class="${passed ? 'text-green-400' : 'text-red-400'}">${escapeHtml(String(step.status || 'unknown').toUpperCase())}</span>${step.error ? `<pre class="text-red-300 whitespace-pre-wrap mt-1">${escapeHtml(step.error)}</pre>` : ''}
        </li>`;
      }).join('\n');
    } else {
      stepsHtml = `<li class="relative">
        <span class="absolute -left-[23px] top-1 w-3 h-3 rounded-full ${statusText === 'FAILED' ? 'bg-red-500' : 'bg-green-500'} ring-4 ring-surface"></span>
        <span class="font-bold">Scenario Execution:</span> ${statusText === 'FAILED' ? 'Failed' : 'Completed successfully'}.
      </li>`;
    }

    let errorHtml = '';
    if (reportData?.error) {
      errorHtml = `
      <div class="glass-card rounded-lg p-6 border border-red-500/30">
        <h3 class="text-lg font-semibold mb-2 text-red-400">Error Details</h3>
        <pre class="bg-black/40 p-4 rounded border border-white/5 overflow-x-auto text-sm font-mono text-red-300 whitespace-pre-wrap">${escapeHtml(reportData.error)}</pre>
      </div>`;
    }

    const screenshotsHtml = (reportData?.steps || []).filter((step: any) => step.screenshot).map((step: any, index: number) => `
      <details class="glass-card rounded-lg p-4">
        <summary class="cursor-pointer font-semibold">Step ${index + 1}: ${escapeHtml(step.name || 'Screenshot')}</summary>
        <img class="mt-3 max-w-full rounded border border-white/10" src="${step.screenshot}" alt="Screenshot after step ${index + 1}" />
      </details>`).join('');
    const htmlReportButton = reportData?.reportHtmlPath
      ? `<button class="px-3 py-2 rounded bg-primary-container text-white" onclick="openHtmlReport()">Open standalone HTML report</button>`
      : '';

    return `<!DOCTYPE html>
<html class="dark" lang="en">
<head>
<meta charset="utf-8"/>
<meta content="width=device-width, initial-scale=1.0" name="viewport"/>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline' https:; script-src 'unsafe-inline' https:; img-src https: data:; font-src https: data:;">
<title>Execution Report</title>
<script src="https://cdn.tailwindcss.com?plugins=forms,container-queries"></script>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600&amp;family=Manrope:wght@500;600;700&amp;family=JetBrains+Mono:wght@400&amp;display=swap" rel="stylesheet"/>
<link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&amp;display=swap" rel="stylesheet"/>
<script id="tailwind-config">
  tailwind.config = {
    darkMode: "class",
    theme: {
      extend: {
        "colors": {
          "primary-container": "#0078d4",
          "surface-container": "#1e2020",
          "on-surface": "#e2e2e2",
          "surface": "#121414"
        }
      }
    }
  }
</script>
<style>
  .glass-card {
      background: rgba(30, 32, 32, 0.7);
      backdrop-filter: blur(20px);
      border: 1px solid rgba(255, 255, 255, 0.08);
      box-shadow: 0 4px 30px rgba(0, 0, 0, 0.1);
  }
</style>
</head>
<body class="bg-surface text-on-surface font-sans p-8">
  <div class="max-w-4xl mx-auto space-y-6">
    <div class="flex justify-between items-center pb-4 border-b border-white/10">
      <div>
        <h1 class="text-3xl font-bold">Execution Report</h1>
        <p class="text-gray-400 font-mono text-sm mt-1">ID: ${escapedId}</p>
      </div>
      <div class="px-4 py-2 rounded font-bold border ${statusClass}">
        ${statusText} (${duration})
      </div>
    </div>
    
    ${errorHtml}

    <div class="grid grid-cols-2 gap-4">
      <div class="glass-card rounded-lg p-6">
        <h3 class="text-lg font-semibold mb-2">Timeline</h3>
        <ul class="space-y-3 relative border-l-2 border-white/10 ml-3 pl-4">
          ${stepsHtml}
        </ul>
      </div>
      
      <div class="glass-card rounded-lg p-6">
        <div class="flex justify-between items-center mb-3"><h3 class="text-lg font-semibold">Screenshots</h3>${htmlReportButton}</div>
        <div class="space-y-3">${screenshotsHtml || '<p class="text-gray-500">No screenshots were captured.</p>'}</div>
      </div>
    </div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    function openScreenshot(path) {
      vscode.postMessage({ command: 'openScreenshot', path });
    }
    function openHtmlReport() {
      vscode.postMessage({ command: 'openHtmlReport' });
    }
  </script>
</body>
</html>`;
  }
}
