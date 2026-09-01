import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ExecutionEvents } from '@automation-studio/events';
import { ProjectEvents } from '@automation-studio/events';
import type { IEventBus, ILogger } from '@automation-studio/types';
import type { IWebviewHost, ICardRegistry, IQuickActionRegistry, IWebviewPanel } from './workbench-types';
import type { ProjectService } from '../services/project/project-service';

export class HomeWorkbench {
  private panel?: IWebviewPanel;
  private readonly webviewId = 'automationStudio.home';

  constructor(
    private readonly webviewHost: IWebviewHost,
    private readonly cardRegistry: ICardRegistry,
    private readonly quickActionRegistry: IQuickActionRegistry,
    private readonly eventBus: IEventBus,
    private readonly logger: ILogger,
    private readonly projectService: ProjectService
  ) {
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    this.eventBus.subscribe(ExecutionEvents.ExecutionStarted, (payload: any) => {
      this.panel?.postMessage({ type: 'executionStarted', payload });
    });
    this.eventBus.subscribe(ExecutionEvents.ExecutionProgress, (payload: any) => {
      this.panel?.postMessage({ type: 'executionProgress', payload });
    });
    this.eventBus.subscribe(ExecutionEvents.ExecutionCompleted, (payload: any) => {
      this.panel?.postMessage({ type: 'executionCompleted', payload });
    });
    this.eventBus.subscribe(ExecutionEvents.ExecutionFailed, (payload: any) => {
      this.panel?.postMessage({ type: 'executionFailed', payload });
    });
    this.eventBus.subscribe(ExecutionEvents.ExecutionAborted, (payload: any) => {
      this.panel?.postMessage({ type: 'executionAborted', payload });
    });
    this.eventBus.subscribe('Bitwarden.CredentialsFetched', (payload: any) => {
      this.panel?.postMessage({ type: 'credentialsFetched', payload });
    });
  }

  public show(): void {
    this.panel = this.webviewHost.createOrShow({
      id: this.webviewId,
      title: 'Automation Studio Launcher',
      viewColumn: vscode.ViewColumn.One,
      enableScripts: true,
    });

    this.panel.updateHtml(this.getHtml());

    this.panel.onDidReceiveMessage(async (message) => {
      switch (message.command) {
        case 'executeAction':
          if (message.args) {
            vscode.commands.executeCommand(message.actionId, ...message.args);
          } else {
            vscode.commands.executeCommand(message.actionId);
          }
          break;
        case 'fetchWorkspaceDetails':
          this.sendWorkspaceDetails();
          break;
        case 'selectProject':
          try {
            await this.projectService.manager.open(message.projectPath);
          } catch (err) {
            this.logger.error('Failed to open project on selection change', err as Error);
          }
          break;
      }
    });

    // Re-send workspace details whenever VS Code workspace folders change
    const folderDisposable = vscode.workspace.onDidChangeWorkspaceFolders(() => {
      this.sendWorkspaceDetails();
    });

    // Watch for project.json changes in any workspace folder to auto-refresh the dropdown
    const pattern = new vscode.RelativePattern(vscode.workspace.workspaceFolders?.[0] || '*', '**/project.json');
    const watcher = vscode.workspace.createFileSystemWatcher(pattern);
    watcher.onDidCreate(() => this.sendWorkspaceDetails());
    watcher.onDidDelete(() => this.sendWorkspaceDetails());

    // Also re-send when a project is opened via the ProjectService
    const projectOpenDisposable = this.eventBus.subscribe(ProjectEvents.ProjectOpened, () => {
      this.sendWorkspaceDetails();
    });

    this.panel.onDidDispose(() => {
      folderDisposable.dispose();
      watcher.dispose();
    });

    // Trigger an immediate refresh so the panel gets data if the project
    // was opened before the webview finished loading
    setTimeout(() => this.sendWorkspaceDetails(), 500);

    this.logger.info('Home Workbench opened');
  }

  /** Reads workspace folders, scans them for projects/scenarios and posts them to the webview. */
  private sendWorkspaceDetails(): void {
    if (!this.panel) return;
    try {
      const folders = vscode.workspace.workspaceFolders || [];
      const workspaceDetails: Array<{ name: string; path: string; scenarios: Array<{ id: string; name: string }> }> = [];

      const addProject = (name: string, projectPath: string) => {
        const scenariosDir = path.join(projectPath, 'automation', 'scenarios');
        const scenariosList: Array<{ id: string; name: string }> = [];

        if (fs.existsSync(scenariosDir)) {
          const entries = fs.readdirSync(scenariosDir, { withFileTypes: true });
          for (const entry of entries) {
            if (entry.isDirectory()) {
              const subDir = path.join(scenariosDir, entry.name);
              for (const subFile of fs.readdirSync(subDir)) {
                if (subFile.endsWith('.scenario.json')) {
                  const filePath = path.join(subDir, subFile);
                  try {
                    const content = fs.readFileSync(filePath, 'utf-8');
                    const json = JSON.parse(content);
                    scenariosList.push({
                      id: json.id || entry.name,
                      name: json.name || entry.name,
                    });
                  } catch {
                    scenariosList.push({
                      id: entry.name,
                      name: entry.name,
                    });
                  }
                }
              }
            } else if (entry.isFile() && entry.name.endsWith('.scenario.json')) {
              const filePath = path.join(scenariosDir, entry.name);
              try {
                const content = fs.readFileSync(filePath, 'utf-8');
                const json = JSON.parse(content);
                scenariosList.push({
                  id: json.id || entry.name.replace('.scenario.json', ''),
                  name: json.name || entry.name,
                });
              } catch {
                scenariosList.push({
                  id: entry.name.replace('.scenario.json', ''),
                  name: entry.name,
                });
              }
            }
          }
        }

        workspaceDetails.push({
          name: name,
          path: projectPath,
          scenarios: scenariosList,
        });
      };

      for (const folder of folders) {
        const rootPath = folder.uri.fsPath;
        if (fs.existsSync(path.join(rootPath, 'project.json'))) {
          // The folder itself is a project
          addProject(folder.name, rootPath);
        } else if (fs.existsSync(rootPath)) {
          // Check immediate subdirectories for project.json
          const subdirs = fs.readdirSync(rootPath, { withFileTypes: true });
          for (const subdir of subdirs) {
            if (subdir.isDirectory()) {
              const projectPath = path.join(rootPath, subdir.name);
              if (fs.existsSync(path.join(projectPath, 'project.json'))) {
                addProject(subdir.name, projectPath);
              } else if (subdir.name === 'projects') {
                // Scan inside projects/ folder
                const nestedSubdirs = fs.readdirSync(projectPath, { withFileTypes: true });
                for (const nested of nestedSubdirs) {
                  if (nested.isDirectory()) {
                    const nestedPath = path.join(projectPath, nested.name);
                    if (fs.existsSync(path.join(nestedPath, 'project.json'))) {
                      addProject(nested.name, nestedPath);
                    }
                  }
                }
              }
            }
          }
        }
      }

      const activeProjectPath = this.projectService.manager.getCurrentProjectPath();

      this.panel.postMessage({
        type: 'workspaceDetailsFetched',
        payload: {
          projects: workspaceDetails,
          activeProjectPath: activeProjectPath
        },
      });
    } catch (err) {
      this.logger.error('Failed to send workspace details', err as Error);
    }
  }

  private getHtml(): string {
    return `<!DOCTYPE html>
<html class="dark" lang="en">
<head>
<meta charset="utf-8"/>
<meta content="width=device-width, initial-scale=1.0" name="viewport"/>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline' https:; script-src 'unsafe-inline' https:; img-src https: data:; font-src https: data:;">
<title>AutomationStudio - Command Center</title>
<!-- Tailwind CDN (for prototyping) -->
<script src="https://cdn.tailwindcss.com?plugins=forms,container-queries"></script>
<!-- Fonts -->
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600&amp;family=Manrope:wght@500;600;700&amp;family=JetBrains+Mono:wght@400&amp;display=swap" rel="stylesheet"/>
<link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&amp;display=swap" rel="stylesheet"/>
<link href="https://cdn.jsdelivr.net/npm/@vscode/codicons@0.0.36/dist/codicon.css" rel="stylesheet" />
<script id="tailwind-config">
  tailwind.config = {
    darkMode: "class",
    theme: {
      extend: {
        "colors": {
          "secondary-container": "#159ccb",
          "on-surface": "#e2e2e2",
          "surface-container": "#1e2020",
          "surface-tint": "#a3c9ff",
          "secondary": "#74d1ff",
          "surface-variant": "#333535",
          "primary-fixed": "#d3e3ff",
          "primary-container": "#0078d4",
          "surface-container-high": "#282a2b",
          "on-secondary": "#003548",
          "background": "#121414",
          "surface-bright": "#38393a",
          "surface-container-low": "#1a1c1c",
          "primary": "#a3c9ff",
          "surface": "#121414",
          "outline-variant": "#404752",
          "outline": "#8a919e"
        },
        "fontFamily": {
          "body-lg": ["Inter"],
          "code-sm": ["JetBrains Mono"],
          "headline-lg": ["Manrope"],
          "display-lg": ["Manrope"],
          "label-xs": ["Inter"],
          "title-md": ["Manrope"],
          "body-sm": ["Inter"]
        }
      }
    }
  }
</script>
<style>
  .glass-card {
      background: rgba(22, 24, 25, 0.7);
      backdrop-filter: blur(20px);
      border: 1px solid rgba(255, 255, 255, 0.06);
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  }
  .glow-hover:hover {
      box-shadow: 0 0 25px rgba(116, 209, 255, 0.2);
      transform: translateY(-1px);
  }
  .scrollbar-hidden::-webkit-scrollbar {
      display: none;
  }
  .mode-option {
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }
  .mode-option:hover {
      border-color: rgba(116, 209, 255, 0.3);
      background: rgba(255, 255, 255, 0.03);
  }
  .mode-option.active {
      background: linear-gradient(135deg, rgba(0, 120, 212, 0.2) 0%, rgba(21, 156, 203, 0.1) 100%);
      border-color: #74d1ff;
      box-shadow: 0 0 20px rgba(116, 209, 255, 0.15);
  }
</style>
</head>
<body class="bg-[#0a0c10] text-on-surface font-body-sm overflow-hidden select-none">
<main class="h-screen w-full flex flex-col relative overflow-hidden">
  
  <!-- Header -->
  <header class="flex justify-between items-center p-6 border-b border-white/5 bg-black/20">
    <div class="flex items-center gap-3">
      <span class="material-symbols-outlined text-primary text-3xl">token</span>
      <div>
        <h1 class="font-headline-lg text-2xl font-bold tracking-tight bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">Automation Studio Launcher</h1>
        <p class="text-xs text-on-surface/50">Enterprise RPA and Test Automation Studio</p>
      </div>
    </div>
    
    <div>
      <button id="bitwarden-btn" onclick="handleBitwardenClick()" class="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-primary-container to-secondary-container hover:opacity-90 active:scale-95 transition-all text-xs font-semibold rounded-lg text-white shadow-lg shadow-primary-container/10 border border-primary/20 glow-hover">
        <span class="material-symbols-outlined text-sm">vpn_key</span>
        Fetch Credentials from Bitwarden
      </button>
    </div>
  </header>

  <!-- Dashboard Content -->
  <div class="flex-1 overflow-y-auto p-8 scrollbar-hidden">
    <div class="max-w-5xl mx-auto space-y-8">
      
      <!-- Recording Configuration Card -->
      <section class="glass-card rounded-2xl p-6 space-y-4">
        <div class="flex items-center gap-2 text-primary">
          <span class="material-symbols-outlined text-xl">settings_applications</span>
          <h3 class="font-headline-lg font-bold text-sm">Recording Target & Scope</h3>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div class="space-y-1.5">
            <div class="flex justify-between items-center">
              <label class="text-[10px] font-bold uppercase tracking-wider text-on-surface/40">Target Workspace Project</label>
              <div class="flex gap-2.5">
                <button onclick="executeAction('automationStudio.project.create')" title="Create New Project" class="text-primary hover:opacity-80 transition-opacity flex items-center gap-1 bg-white/5 px-1.5 py-0.5 rounded border border-white/10">
                  <span class="codicon codicon-add text-[10px]"></span>
                  <span class="text-[9px] font-bold uppercase tracking-wider">New</span>
                </button>
                <button onclick="executeAction('automationStudio.project.open')" title="Open Existing Project" class="text-primary hover:opacity-80 transition-opacity flex items-center gap-1 bg-white/5 px-1.5 py-0.5 rounded border border-white/10">
                  <span class="codicon codicon-folder-opened text-[10px]"></span>
                  <span class="text-[9px] font-bold uppercase tracking-wider">Open</span>
                </button>
              </div>
            </div>
            <select id="project-select" onchange="handleProjectChange(true)" class="w-full text-xs bg-white/5 border border-white/10 rounded-lg p-2.5 text-on-surface focus:outline-none focus:border-primary/50 cursor-pointer">
              <!-- Dynamically populated -->
            </select>
          </div>
          <div class="space-y-1.5">
            <label class="text-[10px] font-bold uppercase tracking-wider text-on-surface/40">Target Scenario</label>
            <select id="scenario-select" onchange="handleScenarioChange()" class="w-full text-xs bg-white/5 border border-white/10 rounded-lg p-2.5 text-on-surface focus:outline-none focus:border-primary/50 cursor-pointer">
              <option value="new">[Create New Scenario]</option>
              <!-- Dynamically populated -->
            </select>
          </div>
          <div class="space-y-1.5" id="new-scenario-container">
            <label class="text-[10px] font-bold uppercase tracking-wider text-on-surface/40">New Scenario Name</label>
            <input type="text" id="new-scenario-name" class="w-full text-xs bg-white/5 border border-white/10 rounded-lg p-2.5 text-on-surface focus:outline-none focus:border-primary/50" placeholder="e.g. login-flow-scenario" value="My Recorded Scenario">
          </div>
        </div>
      </section>

      <!-- Four Modes Selector -->
      <section class="space-y-3">
        <label class="text-xs font-bold uppercase tracking-widest text-on-surface/40">Select Automation Mode</label>
        <div class="grid grid-cols-4 gap-4 p-2 glass-card rounded-2xl">
          
          <!-- Vision -->
          <div id="mode-vision" onclick="selectMode('vision')" class="mode-option active flex flex-col items-center justify-center p-6 rounded-xl cursor-pointer border border-transparent">
            <span class="material-symbols-outlined text-primary text-3xl mb-2">visibility</span>
            <span class="font-headline-lg font-bold text-sm">Vision</span>
            <span class="text-[10px] text-on-surface/50 mt-1">Computer Vision & OCR</span>
          </div>

          <!-- Desktop -->
          <div id="mode-desktop" onclick="selectMode('desktop')" class="mode-option flex flex-col items-center justify-center p-6 rounded-xl cursor-pointer border border-transparent">
            <span class="material-symbols-outlined text-secondary text-3xl mb-2">desktop_windows</span>
            <span class="font-headline-lg font-bold text-sm">Desktop</span>
            <span class="text-[10px] text-on-surface/50 mt-1">Native OS Automation</span>
          </div>

          <!-- PW -->
          <div id="mode-pw" onclick="selectMode('pw')" class="mode-option flex flex-col items-center justify-center p-6 rounded-xl cursor-pointer border border-transparent">
            <span class="material-symbols-outlined text-surface-tint text-3xl mb-2">language</span>
            <span class="font-headline-lg font-bold text-sm">PW (Playwright)</span>
            <span class="text-[10px] text-on-surface/50 mt-1">Web Automation Engine</span>
          </div>

          <!-- Jira -->
          <div id="mode-jira" onclick="selectMode('jira')" class="mode-option flex flex-col items-center justify-center p-6 rounded-xl cursor-pointer border border-transparent">
            <span class="material-symbols-outlined text-amber-400 text-3xl mb-2">task_alt</span>
            <span class="font-headline-lg font-bold text-sm">Jira</span>
            <span class="text-[10px] text-on-surface/50 mt-1">Test Sync & Issues</span>
          </div>

        </div>
      </section>

      <!-- Active Mode Panel -->
      <section class="glass-card rounded-2xl p-8 min-h-[300px] flex flex-col justify-between">
        <div id="mode-panel-content" class="flex-1">
          <!-- Dynamically populated -->
        </div>
      </section>

      <!-- Credentials Status Bar -->
      <footer id="credentials-status" class="flex justify-between items-center px-6 py-4 glass-card rounded-xl text-xs">
        <div class="flex items-center gap-2">
          <span class="w-2 h-2 rounded-full bg-red-500" id="credentials-dot"></span>
          <span id="credentials-text" class="text-on-surface/70">No credentials fetched. Vault is locked.</span>
        </div>
        <div class="text-[10px] opacity-40 font-code-sm">Bitwarden Vault Status</div>
      </footer>

    </div>
  </div>
</main>

<script>
  const vscode = acquireVsCodeApi();
  let activeMode = 'vision';
  let vaultCredentials = null;
  let workspaceDetails = [];

  function executeAction(actionId, ...args) {
    vscode.postMessage({ command: 'executeAction', actionId, args });
  }

  function fetchWorkspaceDetails() {
    vscode.postMessage({ command: 'fetchWorkspaceDetails' });
  }

  function selectMode(mode) {
    document.querySelectorAll('.mode-option').forEach(el => el.classList.remove('active'));
    document.getElementById('mode-' + mode).classList.add('active');
    activeMode = mode;
    updatePanel();
  }

  function populateProjects(activePath) {
    const projectSelect = document.getElementById('project-select');
    if (!projectSelect) return;

    projectSelect.innerHTML = '';
    workspaceDetails.forEach((proj, idx) => {
      const opt = document.createElement('option');
      opt.value = proj.path;
      opt.innerText = proj.name;
      if (proj.path === activePath) {
        opt.selected = true;
      }
      projectSelect.appendChild(opt);
    });

    handleProjectChange(false);
  }

  function handleProjectChange(userTriggered) {
    const projectSelect = document.getElementById('project-select');
    const scenarioSelect = document.getElementById('scenario-select');
    if (!projectSelect || !scenarioSelect) return;

    const selectedProjPath = projectSelect.value;
    const proj = workspaceDetails.find(p => p.path === selectedProjPath);

    scenarioSelect.innerHTML = '<option value="new">[Create New Scenario]</option>';

    if (proj && proj.scenarios) {
      proj.scenarios.forEach(scen => {
        const opt = document.createElement('option');
        opt.value = scen.id;
        opt.innerText = scen.name;
        scenarioSelect.appendChild(opt);
      });
    }

    if (userTriggered) {
      vscode.postMessage({ command: 'selectProject', projectPath: selectedProjPath });
    }

    handleScenarioChange();
  }

  function handleScenarioChange() {
    const scenarioSelect = document.getElementById('scenario-select');
    const newContainer = document.getElementById('new-scenario-container');
    if (!scenarioSelect || !newContainer) return;

    if (scenarioSelect.value === 'new') {
      newContainer.style.display = 'block';
    } else {
      newContainer.style.display = 'none';
    }
  }

  function openFlowBuilder(mode) {
    const projectSelect = document.getElementById('project-select');
    const scenarioSelect = document.getElementById('scenario-select');
    const newNameInput = document.getElementById('new-scenario-name');
    const pwUrl = document.getElementById('pw-url');
    const selectedScenario = scenarioSelect && scenarioSelect.value !== 'new'
      ? scenarioSelect.options[scenarioSelect.selectedIndex].text
      : (newNameInput ? newNameInput.value.trim() : '');
    executeAction('automationStudio.flowBuilder.show', mode === 'pw' ? 'pw' : 'surface', {
      projectPath: projectSelect ? projectSelect.value : '',
      scenarioId: scenarioSelect && scenarioSelect.value !== 'new' ? scenarioSelect.value : null,
      scenarioName: selectedScenario || 'New Automation Script',
      url: pwUrl ? pwUrl.value : undefined
    });
  }

  function updatePanel() {
    const container = document.getElementById('mode-panel-content');
    if (!container) return;

    let html = '';
    switch (activeMode) {
      case 'vision':
        html = \`
          <div class="space-y-6">
            <div class="flex justify-between items-start">
              <div>
                <h3 class="text-xl font-bold text-primary flex items-center gap-2">
                  <span class="material-symbols-outlined">visibility</span>
                  Vision Mode
                </h3>
                <p class="text-xs text-on-surface/60 mt-1">Automate cross-platform applications using AI visual recognition and screen OCR engines.</p>
              </div>
              <span class="px-2.5 py-1 rounded bg-primary/10 text-primary border border-primary/20 text-[10px] font-bold tracking-widest uppercase">ACTIVE ENGINE</span>
            </div>
            
            <div class="grid grid-cols-3 gap-6 pt-4">
              <div class="bg-black/20 p-5 rounded-xl border border-white/5 space-y-2">
                <span class="material-symbols-outlined text-primary text-xl">photo_camera</span>
                <h4 class="font-bold text-sm">Visual Target Tracking</h4>
                <p class="text-[11px] text-on-surface/50">Capture visual templates and elements from the active screen workspace.</p>
              </div>
              <div class="bg-black/20 p-5 rounded-xl border border-white/5 space-y-2">
                <span class="material-symbols-outlined text-primary text-xl">abc</span>
                <h4 class="font-bold text-sm">OCR Screen Parsing</h4>
                <p class="text-[11px] text-on-surface/50">Locate texts and fields inside visual frames dynamically at run-time.</p>
              </div>
              <div class="bg-black/20 p-5 rounded-xl border border-white/5 space-y-2">
                <span class="material-symbols-outlined text-primary text-xl">developer_board</span>
                <h4 class="font-bold text-sm">Legacy Application Bridge</h4>
                <p class="text-[11px] text-on-surface/50">Seamlessly automate remote desktop terminals and visual-only windows.</p>
              </div>
            </div>

            <div class="flex gap-4 pt-6 border-t border-white/5">
              <button onclick="openFlowBuilder('surface')" class="flex items-center gap-2 px-6 py-2.5 bg-primary/10 hover:bg-primary/20 text-primary font-bold border border-primary/30 rounded-lg text-xs transition-all">
                <span class="material-symbols-outlined text-primary text-base">account_tree</span>
                Open Surface Flow Builder
              </button>
              <button onclick="executeAction('automationStudio.startInspector')" class="flex items-center gap-2 px-6 py-2.5 bg-white/5 hover:bg-white/10 text-on-surface border border-white/10 rounded-lg text-xs transition-all">
                <span class="material-symbols-outlined text-primary text-base">pageview</span>
                Start Element Inspector
              </button>
            </div>
          </div>
        \`;
        break;
      case 'desktop':
        html = \`
          <div class="space-y-6">
            <div class="flex justify-between items-start">
              <div>
                <h3 class="text-xl font-bold text-secondary flex items-center gap-2">
                  <span class="material-symbols-outlined">desktop_windows</span>
                  Desktop Mode
                </h3>
                <p class="text-xs text-on-surface/60 mt-1">Directly interact with native desktop OS events, coordinates, and application windows.</p>
              </div>
              <span class="px-2.5 py-1 rounded bg-secondary/10 text-secondary border border-secondary/20 text-[10px] font-bold tracking-widest uppercase">NATIVE SYSTEM</span>
            </div>

            <div class="grid grid-cols-3 gap-6 pt-4">
              <div class="bg-black/20 p-5 rounded-xl border border-white/5 space-y-2">
                <span class="material-symbols-outlined text-secondary text-xl">mouse</span>
                <h4 class="font-bold text-sm">Mouse Tracking</h4>
                <p class="text-[11px] text-on-surface/50">Capture absolute/relative coordinate paths for desktop interaction.</p>
              </div>
              <div class="bg-black/20 p-5 rounded-xl border border-white/5 space-y-2">
                <span class="material-symbols-outlined text-secondary text-xl">keyboard</span>
                <h4 class="font-bold text-sm">Keyboard Hooks</h4>
                <p class="text-[11px] text-on-surface/50">Interact with native hardware input and shortcuts at the OS level.</p>
              </div>
              <div class="bg-black/20 p-5 rounded-xl border border-white/5 space-y-2">
                <span class="material-symbols-outlined text-secondary text-xl">window</span>
                <h4 class="font-bold text-sm">Process Binding</h4>
                <p class="text-[11px] text-on-surface/50">Bind automation runtimes directly to specific application process names.</p>
              </div>
            </div>

            <div class="pt-4 border-t border-white/5 space-y-1.5">
              <label class="text-[10px] font-bold uppercase tracking-wider text-on-surface/40">Target URL</label>
              <input id="pw-url" type="url" class="w-full text-xs bg-white/5 border border-white/10 rounded-lg p-2.5 text-on-surface" value="https://practicetestautomation.com/" placeholder="https://site-under-test">
            </div>

            <div class="flex gap-4 pt-6 border-t border-white/5">
              <button onclick="openFlowBuilder('surface')" class="flex items-center gap-2 px-6 py-2.5 bg-secondary/10 hover:bg-secondary/20 text-secondary font-bold border border-secondary/30 rounded-lg text-xs transition-all">
                <span class="material-symbols-outlined text-secondary text-base">account_tree</span>
                Open Surface Flow Builder
              </button>
            </div>
          </div>
        \`;
        break;
      case 'pw':
        html = \`
          <div class="space-y-6">
            <div class="flex justify-between items-start">
              <div>
                <h3 class="text-xl font-bold text-surface-tint flex items-center gap-2">
                  <span class="material-symbols-outlined">language</span>
                  PW (Playwright) Mode
                </h3>
                <p class="text-xs text-on-surface/60 mt-1">High-performance browser automation utilizing CSS selectors, locator structures, and Playwright execution.</p>
              </div>
              <span class="px-2.5 py-1 rounded bg-surface-tint/10 text-surface-tint border border-surface-tint/20 text-[10px] font-bold tracking-widest uppercase">WEB ENGINE</span>
            </div>

            <div class="grid grid-cols-3 gap-6 pt-4">
              <div class="bg-black/20 p-5 rounded-xl border border-white/5 space-y-2">
                <span class="material-symbols-outlined text-surface-tint text-xl">open_in_browser</span>
                <h4 class="font-bold text-sm">Playwright Browser</h4>
                <p class="text-[11px] text-on-surface/50">Exposes target URL inputs to launch and inject listeners to custom Chromium instances.</p>
              </div>
              <div class="bg-black/20 p-5 rounded-xl border border-white/5 space-y-2">
                <span class="material-symbols-outlined text-surface-tint text-xl">css</span>
                <h4 class="font-bold text-sm">CSS Selector Maps</h4>
                <p class="text-[11px] text-on-surface/50">Auto-identifies targets by ID, class, and tags instead of visual coordinates.</p>
              </div>
              <div class="bg-black/20 p-5 rounded-xl border border-white/5 space-y-2">
                <span class="material-symbols-outlined text-surface-tint text-xl">javascript</span>
                <h4 class="font-bold text-sm">Playwright Scripts</h4>
                <p class="text-[11px] text-on-surface/50">Output cleaner, faster scripts using standard page action locators.</p>
              </div>
            </div>

            <div class="flex gap-4 pt-6 border-t border-white/5">
              <button onclick="openFlowBuilder('pw')" class="flex items-center gap-2 px-6 py-2.5 bg-surface-tint/10 hover:bg-surface-tint/20 text-surface-tint font-bold border border-surface-tint/30 rounded-lg text-xs transition-all">
                <span class="material-symbols-outlined text-surface-tint text-base">account_tree</span>
                Open PW Flow Builder
              </button>
            </div>
          </div>
        \`;
        break;
      case 'jira':
        html = \`
          <div class="space-y-6">
            <div class="flex justify-between items-start">
              <div>
                <h3 class="text-xl font-bold text-amber-400 flex items-center gap-2">
                  <span class="material-symbols-outlined">task_alt</span>
                  Jira Integration
                </h3>
                <p class="text-xs text-on-surface/60 mt-1">Connect your automation studio to Jira to fetch test tickets, sync status, and report execution logs.</p>
              </div>
              <span class="px-2.5 py-1 rounded bg-amber-400/10 text-amber-400 border border-amber-400/20 text-[10px] font-bold tracking-widest uppercase">SYNC PANEL</span>
            </div>

            <div class="p-6 bg-black/25 rounded-xl border border-white/5 space-y-4">
              <h4 class="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-2">
                <span class="material-symbols-outlined text-sm">lock_open</span>
                Credentials Vault Mapping
              </h4>
              <div class="grid grid-cols-2 gap-4">
                <div class="space-y-1">
                  <label class="text-[10px] opacity-40 uppercase">Vault Username</label>
                  <input type="text" readonly id="vault-username" class="w-full text-xs bg-white/5 border border-white/10 rounded-lg p-2.5 text-on-surface focus:outline-none" value="\${vaultCredentials ? vaultCredentials.username : 'Vault Locked...'}">
                </div>
                <div class="space-y-1">
                  <label class="text-[10px] opacity-40 uppercase">Vault Password</label>
                  <input type="password" readonly id="vault-password" class="w-full text-xs bg-white/5 border border-white/10 rounded-lg p-2.5 text-on-surface focus:outline-none" value="\${vaultCredentials ? vaultCredentials.password : '••••••••••••'}">
                </div>
              </div>
            </div>

            <div class="flex gap-4 pt-6 border-t border-white/5">
              <button onclick="vscode.window.showInformationMessage('Syncing tickets...')" class="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-amber-500/20 to-amber-600/20 hover:from-amber-500/30 hover:to-amber-600/30 text-amber-400 font-bold border border-amber-500/30 rounded-lg text-xs transition-all">
                <span class="material-symbols-outlined text-base">sync</span>
                Sync Jira Tickets
              </button>
            </div>
          </div>
        \`;
        break;
    }

    container.innerHTML = html;
  }

  function handleBitwardenClick() {
    if (vaultCredentials) {
      // Disconnect session
      vaultCredentials = null;
      
      // Reset button style
      const btn = document.getElementById('bitwarden-btn');
      if (btn) {
        btn.className = 'flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-primary-container to-secondary-container hover:opacity-90 active:scale-95 transition-all text-xs font-semibold rounded-lg text-white shadow-lg shadow-primary-container/10 border border-primary/20 glow-hover';
        btn.innerHTML = '<span class="material-symbols-outlined text-sm">vpn_key</span>Fetch Credentials from Bitwarden';
      }

      // Reset footer
      const dot = document.getElementById('credentials-dot');
      const text = document.getElementById('credentials-text');
      if (dot) {
        dot.className = 'w-2 h-2 rounded-full bg-red-500';
      }
      if (text) {
        text.innerText = 'No credentials fetched. Vault is locked.';
      }

      // Update Jira view if active
      if (activeMode === 'jira') {
        updatePanel();
      }

      vscode.postMessage({ command: 'executeAction', actionId: 'automationStudio.bitwarden.disconnect' });
    } else {
      executeAction('automationStudio.bitwarden.fetchCredentials');
    }
  }

  // Listen for execution and bitwarden events
  window.addEventListener('message', event => {
    const message = event.data;
    if (message.type === 'credentialsFetched') {
      vaultCredentials = message.payload;
      
      // Update button state to green
      const btn = document.getElementById('bitwarden-btn');
      if (btn) {
        btn.className = 'flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-green-500 to-emerald-600 hover:opacity-90 active:scale-95 transition-all text-xs font-semibold rounded-lg text-white shadow-lg shadow-green-500/10 border border-green-400/20';
        btn.innerHTML = '<span class="material-symbols-outlined text-sm">lock_open</span>Bitwarden Connected (Click to Disconnect)';
      }

      // Update footer
      const dot = document.getElementById('credentials-dot');
      const text = document.getElementById('credentials-text');
      if (dot) {
        dot.className = 'w-2 h-2 rounded-full bg-green-500 animate-pulse';
      }
      if (text) {
        text.innerText = 'Connected to Bitwarden Vault. Credential loaded: "' + vaultCredentials.username + '"';
      }

      // If active mode is Jira, update input values dynamically
      if (activeMode === 'jira') {
        updatePanel();
      }
    } else if (message.type === 'workspaceDetailsFetched') {
      workspaceDetails = message.payload.projects;
      populateProjects(message.payload.activeProjectPath);
    }
  });

  // Initial panel draw & fetch workspace details
  updatePanel();
  fetchWorkspaceDetails();
</script>
</body>
</html>`;
  }
}
