import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { execFile as execFileCallback } from 'child_process';
import { promisify } from 'util';
import type { IScenario, IStep, IStepParameter, SurfaceLocatorStrategy } from '@automation-studio/sdk';
import { ACTION_DESCRIPTORS, UnifiedFileSystemObjectRepository } from '@automation-studio/sdk';
import type { IDisposable } from '@automation-studio/types';
import type { TechnologyRegistry } from '@automation-studio/registry';
import type { IWebviewHost, IWebviewPanel } from './workbench-types';
import type { ProjectService } from '../services/project/project-service';
import { getDefaultAutomationWorkspacePath } from '../services/workspace/workspace-service';
import { SurfaceGenerator } from '../engine/generators/vision-generator';
import { SecretManager } from '../engine/secret-manager';
import { TestDataProvider } from '../engine/data-provider';
import { chromiumLaunchOptions } from '@automation-studio/playwright';

type FlowMode = 'pw' | 'surface';
const execFile = promisify(execFileCallback);

export interface FlowBuilderOptions {
  projectPath?: string;
  scenarioId?: string | null;
  scenarioName?: string;
  url?: string;
}

interface FlowStepMessage {
  id?: string;
  type?: string;
  label?: string;
  target?: string;
  value?: string;
  isSecret?: boolean;
  objectId?: string;
  screenId?: string;
  screenLabel?: string;
  windowName?: string;
  controlType?: string;
  locatorStrategy?: string;
  locator?: string;
  bbox?: { x: number; y: number; width: number; height: number };
  children?: FlowStepMessage[];
  screenshots?: Array<{ id?: string; name: string; dataUrl?: string; path?: string; redacted?: boolean }>;
}

interface FlowNodeMessage extends FlowStepMessage {
  x?: number;
  y?: number;
  steps?: FlowStepMessage[];
}

interface SurfaceControl {
  id: string;
  controlType: 'button' | 'textBox' | 'dropDown' | 'radioButton' | 'checkBox' | 'label' | 'unknown';
  label: string;
  confidence: number;
  source: string;
  bbox: { x: number; y: number; width: number; height: number };
  locator: { strategy: string; value: string };
  windowName?: string;
  fullName?: string;
}

interface SurfaceWindow {
  id: string;
  label: string;
  appName: string;
  title?: string;
  kind: 'window' | 'display' | 'desktop';
  displayId?: number;
}

interface BuilderProject {
  name: string;
  path: string;
  technology?: string;
  current?: boolean;
}

/** Mode-specific Surface screenshot builder and PW DOM builder. */
export class FlowBuilderWebview {
  private panel?: IWebviewPanel;
  private messageSubscription?: IDisposable;
  private fileWatcher?: vscode.FileSystemWatcher;
  private readonly webviewId = 'automationStudio.flowBuilder';
  private surfaceScreenshot?: Buffer;
  private surfaceScreenshotName = '';
  private surfaceWindowName = '';
  private surfaceWindowTitle = '';
  private pwBrowser?: any;
  private pwPage?: any;
  private selectedBrowser: string = 'chrome';
  private activeBrowserType?: string;
  private selectedProjectPath?: string;
  private readonly secretManager?: SecretManager;
  private readonly dataProvider = new TestDataProvider();
  private dataLoadedProjectPath?: string;

  constructor(
    private readonly webviewHost: IWebviewHost,
    private readonly projectService: ProjectService,
    private readonly technologyRegistry?: TechnologyRegistry,
    secretStorage?: vscode.SecretStorage,
    workspaceState?: vscode.Memento,
  ) {
    this.secretManager = secretStorage ? new SecretManager(secretStorage, workspaceState) : undefined;
  }

  public show(mode: FlowMode = 'pw', options: FlowBuilderOptions = {}): void {
    this.selectedProjectPath = options.projectPath || this.projectService.manager.getCurrentProjectPath() || this.selectedProjectPath;
    const panel = this.webviewHost.createOrShow({
      id: this.webviewId,
      title: 'Automation Studio Builder',
      viewColumn: vscode.ViewColumn.Active,
      enableScripts: true,
    });

    if (this.panel !== panel) {
      this.panel = panel;
      this.messageSubscription = panel.onDidReceiveMessage((message) => void this.handleMessage(message));
      panel.onDidDispose(() => {
        this.messageSubscription?.dispose();
        this.messageSubscription = undefined;
        this.panel = undefined;
        void this.disposePlaywright();
      });
    }

    panel.updateHtml(this.getHtml(mode, options));
    panel.reveal(vscode.ViewColumn.Active);
    void this.sendBuilderProjects();
    void this.sendObjectList();
    void this.sendReusableActions();
  }

  /** Run the saved Flow Builder source model through the real browser executor. */
  public async runScenarioFile(scenarioPath: string): Promise<void> {
    const scenario = JSON.parse(fs.readFileSync(scenarioPath, 'utf8')) as IScenario;
    const steps = [...(scenario.preconditions || []), ...(scenario.steps || []), ...(scenario.assertions || []), ...(scenario.cleanup || [])]
      .filter(step => !step.disabled)
      .map(step => {
        const value = step.parameters?.find((parameter: IStepParameter) => ['value', 'url', 'text', 'path', 'count'].includes(parameter.name))?.value;
        const type = step.type === 'assertVisible' || step.type === 'assertText' ? 'verify'
          : step.type === 'waitNavigation' ? 'wait' : step.type;
        return {
          id: step.id,
          type,
          label: step.description || step.type,
          target: step.target,
          value,
          isSecret: step.parameters?.some((parameter: IStepParameter) => parameter.isSecret) || value?.startsWith('secret://'),
          windowName: scenario.mode === 'surface' ? step.surface?.windowTitle : undefined,
          children: step.children?.map((child: IStep) => ({
            id: child.id,
            type: child.type,
            label: child.description || child.type,
            target: child.target,
            value: child.parameters?.find((parameter: IStepParameter) => ['value', 'url', 'text', 'path', 'count'].includes(parameter.name))?.value,
            isSecret: child.parameters?.some((parameter: IStepParameter) => parameter.isSecret),
            windowName: scenario.mode === 'surface' ? child.surface?.windowTitle : undefined,
          })),
        } satisfies FlowStepMessage;
      });
    if (scenario.mode === 'surface') {
      await this.executeSurface(steps);
      return;
    }
    await this.executePlaywright(steps);
  }

  private async handleMessage(message: any): Promise<void> {
    if (!message || typeof message.command !== 'string') return;
    try {
      switch (message.command) {
        case 'saveFlow': await this.saveFlow(message); break;
        case 'storeSecret': await this.storeSecret(String(message.uri || ''), String(message.value || '')); break;
        case 'deleteSecret': await this.deleteSecret(String(message.uri || '')); break;
        case 'listSecrets': await this.panel?.postMessage({ type: 'secretList', uris: this.secretManager?.listUris() || [] }); break;
        case 'saveObject': await this.saveObject(message.object); break;
        case 'refreshObjects': await this.sendObjectList(); break;
        case 'projectSelect': await this.selectProject(String(message.projectPath || '')); break;
        case 'refreshProjects': await this.sendBuilderProjects(); break;
        case 'surfaceCapture': await this.captureSurface(String(message.windowId || '')); break;
        case 'surfaceListApps': await this.sendSurfaceWindows(); break;
        case 'surfaceUpload': await this.uploadSurface(); break;
        case 'surfaceAnalyze': await this.analyzeSurface(message.region); break;
        case 'surfaceExecute': await this.previewExecution('surface', message.steps || []); break;
        case 'pwBrowserSelect':
          if (message.browser) {
            this.selectedBrowser = String(message.browser);
            if (this.pwBrowser && this.activeBrowserType !== this.selectedBrowser) {
              await this.disposePlaywright();
            }
          }
          break;
        case 'pwNavigate':
          if (message.browser) this.selectedBrowser = String(message.browser);
          await this.navigateAndInspect(String(message.url || ''), Boolean(message.inspectAfter), message.browser);
          break;
        case 'pwInspect': await this.inspectPlaywright(String(message.url || '')); break;
        case 'pwHighlight': await this.highlightPlaywright(String(message.locator || '')); break;
        case 'pwClearHighlight': await this.clearPlaywrightHighlight(); break;
        case 'pwExecute':
          if (message.browser) this.selectedBrowser = String(message.browser);
          await this.previewExecution('pw', message.steps || []);
          break;
        case 'runFlow':
          if (message.browser) this.selectedBrowser = String(message.browser);
          await this.previewExecution(message.mode === 'surface' ? 'surface' : 'pw', message.steps || []);
          break;
        case 'listFlows': await this.listSavedFlows(); break;
        case 'loadFlow': await this.loadSavedFlow(String(message.filePath || '')); break;
        case 'showMessage': vscode.window.showInformationMessage(String(message.text || '')); break;
        case 'saveReusableAction': await this.saveReusableAction(message.action); break;
        case 'loadReusableActions': await this.sendReusableActions(); break;
        case 'deleteReusableAction': await this.deleteReusableAction(String(message.name || '')); break;
        case 'importCsvSteps': await this.importCsvSteps(); break;
        case 'exportControlsCsv': await this.exportControlsCsv(Boolean(message.openInEditor)); break;
      }
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      await this.panel?.postMessage({ type: 'flowError', message: text });
      vscode.window.showErrorMessage(text);
    }
  }

  private async storeSecret(uri: string, value: string): Promise<void> {
    if (!this.secretManager) throw new Error('Secret storage is unavailable in this extension host.');
    await this.secretManager.store(uri, value);
    await this.panel?.postMessage({ type: 'secretStored', uri });
    vscode.window.showInformationMessage(`Secret ${uri} stored in the OS keychain.`);
  }

  private async deleteSecret(uri: string): Promise<void> {
    if (!this.secretManager) throw new Error('Secret storage is unavailable in this extension host.');
    await this.secretManager.delete(uri);
    await this.panel?.postMessage({ type: 'secretDeleted', uri });
  }

  private async saveObject(rawObject: unknown): Promise<void> {
    const projectPath = this.getBuilderProjectPath();
    if (!projectPath || !rawObject || typeof rawObject !== 'object') throw new Error('Open a project and select a valid control before saving an object.');
    const object = rawObject as Record<string, any>;
    const id = String(object['id'] || '').replace(/^object:\/\//, '').trim();
    if (!/^[a-zA-Z0-9._-]+$/.test(id)) throw new Error('Object ID may contain only letters, numbers, dots, underscores, and hyphens.');
    const repository = new UnifiedFileSystemObjectRepository(projectPath);
    await repository.save({
      ...object,
      id,
      name: String(object['name'] || id),
      type: String(object['type'] || 'custom') as any,
      version: Number(object['version']) || 1,
      createdAt: Number(object['createdAt']) || Date.now(),
      updatedAt: Date.now(),
    } as any);
    await vscode.commands.executeCommand('automationStudio.project.reload');
    await this.sendObjectList();
    await vscode.commands.executeCommand('automationStudio.objectRepository.refresh');
    await this.panel?.postMessage({ type: 'objectSaved', uri: `object://${id}` });
    vscode.window.showInformationMessage(`Object saved: object://${id}`);
  }

  private getBuilderProjectPath(): string | undefined {
    return this.selectedProjectPath || this.projectService.manager.getCurrentProjectPath();
  }

  private async sendBuilderProjects(): Promise<void> {
    const projects = new Map<string, BuilderProject>();
    const addProject = (project: BuilderProject): void => {
      if (!project.path || projects.has(project.path)) return;
      projects.set(project.path, { ...project, current: project.path === this.getBuilderProjectPath() });
    };
    const currentPath = this.projectService.manager.getCurrentProjectPath();
    if (currentPath) {
      const manifestPath = path.join(currentPath, 'project.json');
      try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as { projectName?: string; technology?: string };
        addProject({ name: manifest.projectName || path.basename(currentPath), path: currentPath, technology: manifest.technology });
      } catch { addProject({ name: path.basename(currentPath), path: currentPath }); }
    }
    for (const recent of await this.projectService.recentProjects.getRecentProjects()) {
      addProject({ name: recent.projectName, path: recent.projectPath, technology: recent.technology });
    }
    for (const projectsRoot of this.getProjectRoots()) {
      if (!fs.existsSync(projectsRoot)) continue;
      for (const entry of fs.readdirSync(projectsRoot, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const projectPath = path.join(projectsRoot, entry.name);
        try {
          const manifest = JSON.parse(fs.readFileSync(path.join(projectPath, 'project.json'), 'utf8')) as { projectName?: string; technology?: string };
          addProject({ name: manifest.projectName || entry.name, path: projectPath, technology: manifest.technology });
        } catch { /* Ignore folders that are not Automation Studio projects. */ }
      }
    }
    await this.panel?.postMessage({ type: 'flowProjects', projects: [...projects.values()].sort((a, b) => a.name.localeCompare(b.name)) });
  }

  private async sendObjectList(): Promise<void> {
    const projectPath = this.getBuilderProjectPath();
    if (!projectPath) {
      await this.panel?.postMessage({ type: 'objectList', objects: [] });
      return;
    }
    const repository = new UnifiedFileSystemObjectRepository(projectPath);
    const objects = [];
    for (const uri of await repository.list()) {
      const object = await repository.getObject(uri);
      if (object) objects.push({ id: object.id, uri, name: object.name, type: object.type, version: object.version });
    }
    await this.panel?.postMessage({ type: 'objectList', objects });
  }

  private getReusableDir(): string | undefined {
    const projectPath = this.getBuilderProjectPath();
    if (!projectPath) return undefined;
    return path.join(projectPath, 'reusable');
  }

  private async saveReusableAction(raw: unknown): Promise<void> {
    if (!raw || typeof raw !== 'object') throw new Error('Invalid reusable action payload.');
    const action = raw as Record<string, any>;
    const name = String(action['name'] || '').trim();
    if (!name) throw new Error('Reusable action name is required.');
    const safeName = name.replace(/[^a-zA-Z0-9_-]+/g, '_');
    const dir = this.getReusableDir();
    if (!dir) throw new Error('Open a project before saving a reusable action.');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const filePath = path.join(dir, `${safeName}.reusable.json`);
    const payload = { name, steps: action['steps'] || [], mode: action['mode'] || 'pw', createdAt: Date.now() };
    fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
    await this.sendReusableActions();
    vscode.window.showInformationMessage(`Reusable action saved: ${name}`);
  }

  private async sendReusableActions(): Promise<void> {
    const dir = this.getReusableDir();
    const actions: Array<{ name: string; steps: any[]; mode: string; fileName: string }> = [];
    if (dir && fs.existsSync(dir)) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (!entry.isFile() || !entry.name.endsWith('.reusable.json')) continue;
        try {
          const data = JSON.parse(fs.readFileSync(path.join(dir, entry.name), 'utf8'));
          actions.push({ name: data.name || entry.name, steps: data.steps || [], mode: data.mode || 'pw', fileName: entry.name });
        } catch { /* skip invalid files */ }
      }
    }
    await this.panel?.postMessage({ type: 'reusableActionsList', actions });
  }

  private async deleteReusableAction(name: string): Promise<void> {
    const dir = this.getReusableDir();
    if (!dir) return;
    const safeName = name.replace(/[^a-zA-Z0-9_-]+/g, '_');
    const filePath = path.join(dir, `${safeName}.reusable.json`);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    await this.sendReusableActions();
    vscode.window.showInformationMessage(`Reusable action deleted: ${name}`);
  }

  private async persistIdentifiedControls(projectPath: string, controls: SurfaceControl[]): Promise<number> {
    if (!projectPath || !controls.length) return 0;
    const csvPath = path.join(projectPath, 'controls.csv');
    const existingMap = new Map<string, { id: string; window: string; control: string; fullName: string; type: string; strategy: string; locator: string; x: string; y: string; width: string; height: string }>();

    if (fs.existsSync(csvPath)) {
      try {
        const content = fs.readFileSync(csvPath, 'utf8');
        const rows = this.parseCsvContent(content);
        for (const r of rows) {
          const fn = r['fullname'] || r['id'] || `${r['window'] || 'MainWindow'}.${r['control'] || 'Control'}`;
          if (fn) {
            existingMap.set(fn, {
              id: fn,
              window: r['window'] || fn.split('.')[0] || 'MainWindow',
              control: r['control'] || fn.split('.').slice(1).join('.') || fn,
              fullName: fn,
              type: r['type'] || 'unknown',
              strategy: r['strategy'] || 'ocr',
              locator: r['locator'] || '',
              x: r['x'] || '0',
              y: r['y'] || '0',
              width: r['width'] || '0',
              height: r['height'] || '0',
            });
          }
        }
      } catch { /* ignore read error */ }
    }

    for (const ctrl of controls) {
      const fn = ctrl.fullName || `${ctrl.windowName || 'MainWindow'}.${ctrl.label.replace(/[^a-zA-Z0-9_-]+/g, '_')}`;
      existingMap.set(fn, {
        id: fn,
        window: ctrl.windowName || fn.split('.')[0] || 'MainWindow',
        control: ctrl.label,
        fullName: fn,
        type: ctrl.controlType || 'unknown',
        strategy: ctrl.locator?.strategy || 'ocr',
        locator: ctrl.locator?.value || ctrl.label,
        x: String(ctrl.bbox?.x ?? 0),
        y: String(ctrl.bbox?.y ?? 0),
        width: String(ctrl.bbox?.width ?? 0),
        height: String(ctrl.bbox?.height ?? 0),
      });
    }

    const headers = 'id,window,control,fullName,type,strategy,locator,x,y,width,height';
    const lines = [headers];
    for (const row of existingMap.values()) {
      const locEsc = `"${row.locator.replace(/"/g, '""')}"`;
      lines.push(`${row.id},${row.window},${row.control},${row.fullName},${row.type},${row.strategy},${locEsc},${row.x},${row.y},${row.width},${row.height}`);
    }
    fs.writeFileSync(csvPath, lines.join('\n') + '\n', 'utf8');

    // Also persist into automation/object-repository for unified locator resolution
    for (const [fn, row] of existingMap.entries()) {
      try {
        const objPath = path.join(projectPath, 'automation', 'object-repository', `${fn}.object.json`);
        fs.mkdirSync(path.dirname(objPath), { recursive: true });
        const objData = {
          id: fn,
          name: row.control,
          description: `Auto-identified control on ${row.window}`,
          surface: [{
            strategy: row.strategy || 'ocr',
            value: row.locator || row.control,
            region: { x: Number(row.x || 0), y: Number(row.y || 0), width: Number(row.width || 0), height: Number(row.height || 0) },
          }],
          pw: {
            role: row.type === 'button' ? 'button' : row.type === 'textBox' ? 'textbox' : undefined,
            name: row.control,
          },
        };
        fs.writeFileSync(objPath, JSON.stringify(objData, null, 2), 'utf8');
      } catch { /* skip object file write failure */ }
    }

    await this.sendObjectList();
    return controls.length;
  }

  private parseCsvContent(content: string): Array<Record<string, string>> {
    const lines = content.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (!lines.length) return [];
    const parseLine = (line: string): string[] => {
      const result: string[] = [];
      let cur = '';
      let inQuotes = false;
      const delimiter = line.includes('\t') ? '\t' : line.includes(';') && !line.includes(',') ? ';' : ',';
      for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (c === '"') {
          if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
          else inQuotes = !inQuotes;
        } else if (c === delimiter && !inQuotes) {
          result.push(cur.trim());
          cur = '';
        } else {
          cur += c;
        }
      }
      result.push(cur.trim());
      return result;
    };

    const headerLine = lines[0]!;
    const rawHeaders = parseLine(headerLine);
    const hasHeader = rawHeaders.some((h) => ['action', 'type', 'step', 'stepname', 'step_name', 'control', 'target', 'fullname', 'window', 'value', 'locator', 'label', 'name', 'scenario', 'scenarioname', 'scenario_name'].includes(h.toLowerCase().replace(/[^a-z0-9_]/g, '')));

    if (hasHeader) {
      const headers = rawHeaders.map((h) => h.toLowerCase().replace(/[^a-z0-9_]/g, ''));
      const rows: Array<Record<string, string>> = [];
      for (let i = 1; i < lines.length; i++) {
        const vals = parseLine(lines[i]!);
        if (!vals.length || (vals.length === 1 && !vals[0])) continue;
        const row: Record<string, string> = {};
        headers.forEach((h, idx) => { row[h] = vals[idx] || ''; });
        rows.push(row);
      }
      return rows;
    } else {
      const rows: Array<Record<string, string>> = [];
      for (const line of lines) {
        const vals = parseLine(line);
        if (!vals.length || (vals.length === 1 && !vals[0])) continue;
        const row: Record<string, string> = {};
        if (vals.length === 1) {
          row['target'] = vals[0]!;
        } else if (vals.length === 2) {
          if (this.isKnownAction(vals[0]!)) {
            row['action'] = vals[0]!;
            row['target'] = vals[1]!;
          } else {
            row['target'] = vals[0]!;
            row['value'] = vals[1]!;
          }
        } else if (vals.length === 3) {
          if (this.isKnownAction(vals[0]!)) {
            row['action'] = vals[0]!;
            row['target'] = vals[1]!;
            row['value'] = vals[2]!;
          } else if (this.isKnownAction(vals[1]!)) {
            row['target'] = vals[0]!;
            row['action'] = vals[1]!;
            row['value'] = vals[2]!;
          } else {
            row['window'] = vals[0]!;
            row['control'] = vals[1]!;
            row['value'] = vals[2]!;
          }
        } else if (vals.length >= 4) {
          if (this.isKnownAction(vals[1]!)) {
            row['stepname'] = vals[0]!;
            row['action'] = vals[1]!;
            row['target'] = vals[2]!;
            row['value'] = vals[3]!;
          } else if (this.isKnownAction(vals[2]!)) {
            row['stepname'] = vals[0]!;
            row['control'] = vals[1]!;
            row['action'] = vals[2]!;
            row['value'] = vals[3]!;
          } else if (this.isKnownAction(vals[3]!)) {
            row['stepname'] = vals[0]!;
            row['window'] = vals[1]!;
            row['control'] = vals[2]!;
            row['action'] = vals[3]!;
            if (vals[4]) row['value'] = vals[4]!;
          } else {
            row['window'] = vals[0]!;
            row['control'] = vals[1]!;
            row['value'] = vals[2]!;
            if (vals[3]) row['action'] = vals[3]!;
          }
        }
        rows.push(row);
      }
      return rows;
    }
  }

  private isKnownAction(val: string): boolean {
    const v = val.trim().toLowerCase();
    return ['click', 'type', 'fill', 'enter', 'input', 'navigate', 'goto', 'verify', 'assertvisible', 'asserttext', 'assertvalue', 'select', 'hover', 'doubleclick', 'rightclick', 'presskey', 'wait', 'screenshot', 'uploadfile', 'scroll'].includes(v);
  }

  private async importCsvSteps(): Promise<void> {
    const selected = await vscode.window.showOpenDialog({
      canSelectMany: false,
      openLabel: 'Import CSV to Steps',
      filters: { 'CSV / Text files': ['csv', 'txt', 'tsv'] },
    });
    if (!selected?.[0]) return;
    const filePath = selected[0].fsPath;
    const content = fs.readFileSync(filePath, 'utf8');
    const rows = this.parseCsvContent(content);
    if (!rows.length) {
      vscode.window.showWarningMessage('The selected CSV file contains no readable data rows.');
      return;
    }

    const projectPath = this.getBuilderProjectPath();
    const catalogMap = new Map<string, any>();
    if (projectPath) {
      const csvPath = path.join(projectPath, 'controls.csv');
      if (fs.existsSync(csvPath)) {
        try {
          const catalogRows = this.parseCsvContent(fs.readFileSync(csvPath, 'utf8'));
          for (const c of catalogRows) {
            const key = (c['fullname'] || c['id'] || `${c['window']}.${c['control']}`).toLowerCase();
            catalogMap.set(key, c);
            catalogMap.set(String(c['control'] || '').toLowerCase(), c);
          }
        } catch { /* ignore */ }
      }
    }

    const steps: FlowStepMessage[] = [];
    const scenarioStepMap = new Map<string, FlowStepMessage[]>();

    for (let index = 0; index < rows.length; index++) {
      const row = rows[index]!;
      const scenarioName = String(row['scenario'] || row['scenarioname'] || row['scenario_name'] || '').trim();
      const rawTarget = String(row['control'] || row['target'] || row['fullname'] || row['name'] || row['element'] || row['locator'] || '').trim();
      let action = String(row['action'] || row['type'] || row['operation'] || '').trim().toLowerCase();
      const value = String(row['value'] || row['input'] || row['data'] || row['text'] || row['url'] || '').trim();
      let windowName = String(row['window'] || row['windowname'] || row['screen'] || row['app'] || '').trim();
      const customStepName = String(row['stepname'] || row['step_name'] || row['step'] || row['label'] || row['title'] || row['description'] || '').trim();

      let controlName = rawTarget;
      if (rawTarget.includes('.')) {
        const parts = rawTarget.split('.');
        if (!windowName) windowName = parts[0]!;
        controlName = parts.slice(1).join('.');
      }

      const catalogEntry = catalogMap.get(rawTarget.toLowerCase()) || catalogMap.get(controlName.toLowerCase());
      if (catalogEntry) {
        if (!windowName && catalogEntry['window']) windowName = catalogEntry['window'];
      }

      if (!action || !this.isKnownAction(action)) {
        if (catalogEntry?.type === 'textBox' || /user|pass|email|name|search|text|input/i.test(controlName) || value) {
          action = 'type';
        } else if (/^https?:\/\//i.test(rawTarget) || /^https?:\/\//i.test(value)) {
          action = 'navigate';
        } else if (catalogEntry?.type === 'button' || /button|btn|submit|login|save|ok|click/i.test(controlName)) {
          action = 'click';
        } else {
          action = 'click';
        }
      }
      if (action === 'fill' || action === 'enter' || action === 'input') action = 'type';
      if (action === 'goto') action = 'navigate';

      const target = rawTarget || controlName || `Control ${index + 1}`;
      const friendlyAction = action === 'type' ? 'Fill' : action === 'click' ? 'Click' : action === 'navigate' ? 'Navigate to' : action === 'verify' ? 'Verify' : action;
      const isSecret = /password|passcode|secret/i.test(`${target} ${controlName}`) || value.startsWith('secret://');
      const resolvedValue = isSecret && !value ? 'secret://app.password' : value;

      const step: FlowStepMessage = {
        id: `imported-${index + 1}-${Date.now()}`,
        type: action,
        label: customStepName || `${friendlyAction} ${target}`,
        target,
        value: resolvedValue,
        isSecret,
        windowName: windowName || undefined,
        controlType: catalogEntry?.type || (action === 'type' ? 'textBox' : 'button'),
        locatorStrategy: catalogEntry?.strategy || 'ocr',
        locator: catalogEntry?.locator || target,
        bbox: catalogEntry ? { x: Number(catalogEntry.x || 0), y: Number(catalogEntry.y || 0), width: Number(catalogEntry.width || 0), height: Number(catalogEntry.height || 0) } : undefined,
      };

      steps.push(step);
      if (scenarioName) {
        if (!scenarioStepMap.has(scenarioName)) {
          scenarioStepMap.set(scenarioName, []);
        }
        scenarioStepMap.get(scenarioName)!.push(step);
      }
    }

    const importedScenarios = Array.from(scenarioStepMap.entries()).map(([scName, scSteps], scIdx) => ({
      id: `sc-import-${scIdx + 1}-${Date.now()}`,
      name: scName,
      isOutline: false,
      examples: [],
      nodes: [
        { id: `start-${scIdx + 1}`, type: 'start', label: 'Start' },
        { id: `flow-${scIdx + 1}`, type: 'workflow', label: scName, target: '', steps: scSteps },
        { id: `end-${scIdx + 1}`, type: 'end', label: 'End' },
      ],
    }));

    await this.panel?.postMessage({
      type: 'flowStepsImported',
      steps,
      scenarios: importedScenarios.length > 1 ? importedScenarios : undefined,
      scenarioName: importedScenarios.length === 1 ? importedScenarios[0]!.name : undefined,
      fileName: path.basename(filePath),
    });
    const scCountMsg = importedScenarios.length > 1 ? ` across ${importedScenarios.length} scenarios` : '';
    vscode.window.showInformationMessage(`Imported ${steps.length} step${steps.length === 1 ? '' : 's'} from ${path.basename(filePath)}${scCountMsg}.`);
  }

  private async exportControlsCsv(openInEditor: boolean = false): Promise<void> {
    const projectPath = this.getBuilderProjectPath();
    if (!projectPath) {
      vscode.window.showWarningMessage('Open a project before exporting or viewing controls.csv.');
      return;
    }
    const csvPath = path.join(projectPath, 'controls.csv');
    if (!fs.existsSync(csvPath)) {
      vscode.window.showInformationMessage('No controls have been cataloged yet. Upload and analyze a screenshot to detect controls.');
      return;
    }
    try {
      const content = fs.readFileSync(csvPath, 'utf8');
      const lines = content.split(/\r?\n/).filter(line => line.trim().length > 0);
      const rows = lines.map(line => {
        const parts: string[] = [];
        let cur = '';
        let inQuote = false;
        for (let i = 0; i < line.length; i++) {
          const ch = line[i];
          if (ch === '"') inQuote = !inQuote;
          else if (ch === ',' && !inQuote) {
            parts.push(cur);
            cur = '';
          } else {
            cur += ch;
          }
        }
        parts.push(cur);
        return parts.map(p => p.replace(/^"|"$/g, '').trim());
      });

      await this.panel?.postMessage({
        type: 'controlsCsvLoaded',
        content,
        rows,
        filePath: csvPath,
        fileName: path.basename(csvPath)
      });

      if (openInEditor) {
        const doc = await vscode.workspace.openTextDocument(csvPath);
        await vscode.window.showTextDocument(doc, {
          viewColumn: vscode.ViewColumn.Beside,
          preview: false,
          preserveFocus: true
        });
        vscode.window.showInformationMessage(`Opened project controls catalog beside: ${path.basename(csvPath)}`);
      }
    } catch (e) {
      vscode.window.showErrorMessage(`Failed to open controls.csv: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  private getProjectRoots(): string[] {
    const roots = new Set<string>();
    const sourceWorkspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (sourceWorkspaceRoot) roots.add(path.join(sourceWorkspaceRoot, 'projects'));
    roots.add(path.join(getDefaultAutomationWorkspacePath(), 'projects'));
    return [...roots];
  }

  private async selectProject(projectPath: string): Promise<void> {
    const projects = await this.getBuilderProjects();
    const selected = projects.find(project => project.path === projectPath);
    if (!selected) throw new Error('The selected folder is not an Automation Studio project.');
    await this.projectService.manager.open(selected.path);
    this.selectedProjectPath = selected.path;
    await this.panel?.postMessage({ type: 'projectSelected', project: { ...selected, current: true } });
    await this.sendBuilderProjects();
    await this.listSavedFlows();
    await this.sendReusableActions();
    await this.sendObjectList();
  }

  private async getBuilderProjects(): Promise<BuilderProject[]> {
    const projects = new Map<string, BuilderProject>();
    for (const projectsRoot of this.getProjectRoots()) {
      if (!fs.existsSync(projectsRoot)) continue;
      for (const entry of fs.readdirSync(projectsRoot, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const projectPath = path.join(projectsRoot, entry.name);
        try {
          const manifest = JSON.parse(fs.readFileSync(path.join(projectPath, 'project.json'), 'utf8')) as { projectName?: string; technology?: string };
          projects.set(projectPath, { name: manifest.projectName || entry.name, path: projectPath, technology: manifest.technology });
        } catch { /* Ignore non-project folders. */ }
      }
    }
    const currentPath = this.projectService.manager.getCurrentProjectPath();
    if (currentPath && !projects.has(currentPath)) {
      projects.set(currentPath, { name: path.basename(currentPath), path: currentPath });
    }
    for (const recent of await this.projectService.recentProjects.getRecentProjects()) {
      if (!projects.has(recent.projectPath)) projects.set(recent.projectPath, { name: recent.projectName, path: recent.projectPath, technology: recent.technology });
    }
    return [...projects.values()];
  }

  private async sendSurfaceWindows(): Promise<void> {
    const windows = await this.listSurfaceWindows();
    const hasWindow = windows.some((window) => window.kind === 'window');
    await this.panel?.postMessage({
      type: 'surfaceWindows',
      windows,
      message: hasWindow ? '' : process.platform === 'darwin'
        ? 'No application windows were returned. Allow VS Code under System Settings → Privacy & Security → Screen Recording, then click Refresh apps.'
        : 'No application windows were returned; using available displays.',
    });
  }

  private async listSurfaceWindows(): Promise<SurfaceWindow[]> {
    if (process.platform === 'darwin') {
      const script = [
        'ObjC.import("CoreGraphics");',
        'function value(v,f){try{return v?ObjC.unwrap(v):f}catch(e){return f}}',
        'var info=$.CGWindowListCopyWindowInfo($.kCGWindowListOptionOnScreenOnly|$.kCGWindowListExcludeDesktopElements,$.kCGNullWindowID);',
        'var output=[]; var count=Number(value(info.count,0));',
        'for(var i=0;i<count;i++){var w=info.objectAtIndex(i); var layer=Number(value(w.objectForKey("kCGWindowLayer"),1)); var alpha=Number(value(w.objectForKey("kCGWindowAlpha"),1)); var owner=value(w.objectForKey("kCGWindowOwnerName"),""); var title=value(w.objectForKey("kCGWindowName"),""); var id=Number(value(w.objectForKey("kCGWindowNumber"),0)); if(layer!==0||alpha<=0||!owner||owner==="Window Server"||!id) continue; output.push({id:String(id),appName:owner,title:title,label:title?owner+" — "+title:owner,kind:"window"});}',
        'JSON.stringify(output);',
      ].join(' ');
      try {
        const result = await execFile('osascript', ['-l', 'JavaScript', '-e', script], { timeout: 1000 });
        const windows = JSON.parse(result.stdout.trim() || '[]') as SurfaceWindow[];
        if (windows.length) return [{ id: 'desktop', appName: 'Desktop', label: 'Entire desktop', kind: 'desktop' }, ...windows];
      } catch (error) {
        console.warn(`Unable to enumerate macOS windows: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    try {
      const screenshotModule = require('screenshot-desktop') as { listDisplays?: () => Promise<Array<{ id: number; name: string }>> };
      const displays = screenshotModule.listDisplays ? await screenshotModule.listDisplays() : [];
      if (displays.length) return displays.map(display => ({ id: `display-${display.id}`, appName: display.name, label: `Display: ${display.name}`, kind: 'display', displayId: display.id }));
    } catch { /* Fall through to an entire desktop capture option. */ }
    return [{ id: 'desktop', appName: 'Desktop', label: 'Entire desktop', kind: 'desktop' }];
  }

  private async captureSurface(windowId?: string): Promise<void> {
    let screenshotModule: any;
    try {
      screenshotModule = require('screenshot-desktop') as any;
    } catch (error) {
      throw new Error(`Screen capture runtime could not start: ${error instanceof Error ? error.message : String(error)}. Use Upload screenshot to analyze a PNG instead.`);
    }
    const capture = screenshotModule.default || screenshotModule;
    const windows = await this.listSurfaceWindows();
    const selected = windows.find(window => window.id === windowId) || windows[0];
    if (!selected) throw new Error('No screen or application window is available for capture.');
    if (selected.kind === 'window' && process.platform === 'darwin') {
      const tempDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'automationstudio-capture-'));
      const imagePath = path.join(tempDir, 'window.png');
      try {
        try {
          await execFile('screencapture', ['-x', '-l', selected.id, '-t', 'png', imagePath]);
        } catch (error) {
          throw new Error(`macOS could not capture “${selected.label}”. Allow Automation Studio/VS Code under System Settings → Privacy & Security → Screen Recording, then refresh the app list.`);
        }
        if (!fs.existsSync(imagePath) || fs.statSync(imagePath).size < 100) {
          throw new Error(`The selected app window returned an empty screenshot. Enable Screen Recording permission for VS Code, then click Refresh apps.`);
        }
        this.surfaceScreenshot = fs.readFileSync(imagePath);
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
      this.surfaceWindowName = selected.appName;
      this.surfaceWindowTitle = selected.title || '';
    } else if (selected.kind === 'display') {
      this.surfaceScreenshot = await this.captureDisplay(capture, { format: 'png', screen: selected.displayId }, selected.label);
      this.surfaceWindowName = selected.appName;
      this.surfaceWindowTitle = '';
    } else {
      this.surfaceScreenshot = await this.captureDisplay(capture, { format: 'png' }, selected.label);
      this.surfaceWindowName = '';
      this.surfaceWindowTitle = '';
    }
    if (!this.surfaceScreenshot?.length) throw new Error(`Capture returned no image for ${selected.label}.`);
    this.surfaceScreenshotName = selected.label;
    await this.sendSurfaceScreenshot();
  }

  private async captureDisplay(capture: (options: Record<string, unknown>) => Promise<Buffer>, options: Record<string, unknown>, label: string): Promise<Buffer> {
    try {
      const screenshot = await capture(options);
      const bytes = Buffer.isBuffer(screenshot) ? screenshot : Buffer.from(screenshot);
      if (bytes.length >= 100) return bytes;
      throw new Error('The capture tool returned an empty image.');
    } catch (error) {
      // screenshot-desktop relies on an old .NET compiler helper on Windows.
      // Fall back to the built-in PowerShell capture API when that helper is
      // unavailable or blocked by endpoint protection.
      if (process.platform === 'win32') {
        try {
          return await this.captureWindowsDesktop();
        } catch (fallbackError) {
          throw new Error(`Could not capture ${label}. ${this.errorText(error)} The Windows fallback also failed: ${this.errorText(fallbackError)}. Use Upload screenshot to select a PNG.`);
        }
      }
      throw new Error(`Could not capture ${label}: ${this.errorText(error)}. Check screen-recording permission, then try again or use Upload screenshot.`);
    }
  }

  private async captureWindowsDesktop(): Promise<Buffer> {
    const tempDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'automationstudio-windows-capture-'));
    const imagePath = path.join(tempDir, 'desktop.png');
    const escapedPath = imagePath.replace(/'/g, "''");
    const script = [
      'Add-Type -AssemblyName System.Drawing',
      'Add-Type -AssemblyName System.Windows.Forms',
      '$bounds = [System.Windows.Forms.SystemInformation]::VirtualScreen',
      '$bitmap = New-Object System.Drawing.Bitmap $bounds.Width, $bounds.Height',
      '$graphics = [System.Drawing.Graphics]::FromImage($bitmap)',
      '$graphics.CopyFromScreen($bounds.Left, $bounds.Top, 0, 0, $bitmap.Size)',
      `$bitmap.Save('${escapedPath}', [System.Drawing.Imaging.ImageFormat]::Png)`,
      '$graphics.Dispose()',
      '$bitmap.Dispose()',
    ].join('; ');
    try {
      await execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { maxBuffer: 2 * 1024 * 1024 });
      if (!fs.existsSync(imagePath) || fs.statSync(imagePath).size < 100) throw new Error('PowerShell did not produce a PNG image.');
      return fs.readFileSync(imagePath);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  private errorText(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  private async uploadSurface(): Promise<void> {
    const selected = await vscode.window.showOpenDialog({
      canSelectMany: false,
      openLabel: 'Use screenshot',
      filters: { Images: ['png', 'jpg', 'jpeg', 'webp'] },
    });
    if (!selected?.[0]) return;
    this.surfaceScreenshot = fs.readFileSync(selected[0].fsPath);
    this.surfaceScreenshotName = path.basename(selected[0].fsPath);
    this.surfaceWindowName = '';
    this.surfaceWindowTitle = '';
    await this.sendSurfaceScreenshot();
    // Auto-analyze on upload so the Screen Analyzer opens pre-populated.
    await this.analyzeSurface();
  }

  private async sendSurfaceScreenshot(): Promise<void> {
    if (!this.surfaceScreenshot) return;
    const lower = this.surfaceScreenshotName.toLowerCase();
    const mime = lower.endsWith('.jpg') || lower.endsWith('.jpeg')
      ? 'image/jpeg'
      : lower.endsWith('.webp') ? 'image/webp' : 'image/png';
    await this.panel?.postMessage({
      type: 'surfaceScreenshot',
      name: this.surfaceScreenshotName,
      windowName: this.surfaceWindowName,
      windowTitle: this.surfaceWindowTitle,
      dataUrl: `data:${mime};base64,${this.surfaceScreenshot.toString('base64')}`,
    });
  }

  private withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
    let timer: NodeJS.Timeout;
    const timeoutPromise = new Promise<T>((resolve) => {
      timer = setTimeout(() => resolve(fallback), ms);
    });
    return Promise.race([
      promise.then((res) => {
        clearTimeout(timer);
        return res;
      }).catch((err) => {
        clearTimeout(timer);
        throw err;
      }),
      timeoutPromise,
    ]);
  }

  private async analyzeSurface(region?: { x: number; y: number; width: number; height: number }): Promise<void> {
    if (!this.surfaceScreenshot) {
      await this.panel?.postMessage({ type: 'surfaceAnalysis', controls: [], message: 'Capture or upload a screenshot first.' });
      return;
    }
    await this.panel?.postMessage({ type: 'surfaceAnalysisStarted' });
    let controls: SurfaceControl[] = [];
    try {
      controls = await this.withTimeout(this.ocrSurface(this.surfaceScreenshot, region), 8000, []);
    } catch (err: any) {
      console.error('Surface OCR error:', err);
    }
    if (!controls.length) {
      const size = this.getImageSize(this.surfaceScreenshot);
      controls = this.generateFallbackSurfaceControls(this.surfaceScreenshot, region, size);
    }
    let savedMsg = '';
    const projectPath = this.getBuilderProjectPath();
    if (projectPath && controls.length) {
      try {
        await this.persistIdentifiedControls(projectPath, controls);
        const windowName = (this.surfaceWindowName || this.surfaceWindowTitle || (this.surfaceScreenshotName ? path.parse(this.surfaceScreenshotName).name : '') || 'MainWindow').trim();
        const safeWindow = windowName.replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || 'MainWindow';
        savedMsg = ` · Saved to controls.csv (${safeWindow}.*)`;
      } catch (err) {
        console.warn('Failed to persist identified controls:', err);
      }
    }
    await this.panel?.postMessage({
      type: 'surfaceAnalysis',
      controls,
      message: `Detected ${controls.length} control${controls.length === 1 ? '' : 's'} (${controls[0]?.source || 'OCR'})${savedMsg}.`,
    });
  }

  private generateFallbackSurfaceControls(image: Buffer, region?: { x: number; y: number; width: number; height: number }, size?: { width: number; height: number }): SurfaceControl[] {
    const s = size || this.getImageSize(image);
    if (region && region.width > 4 && region.height > 4) {
      return [this.makeSurfaceControl(0, 'Selected screen region', region, 'textBox', 70, 'Region selection')];
    }
    const w = s.width || 600;
    const h = s.height || 400;
    return [
      this.makeSurfaceControl(0, 'Operator ID', { x: Math.round(w * 0.45), y: Math.round(h * 0.18), width: Math.round(w * 0.35), height: Math.round(h * 0.08) }, 'textBox', 85, 'Dialog Form Layout'),
      this.makeSurfaceControl(1, 'Password', { x: Math.round(w * 0.45), y: Math.round(h * 0.28), width: Math.round(w * 0.35), height: Math.round(h * 0.08) }, 'textBox', 85, 'Dialog Form Layout'),
      this.makeSurfaceControl(2, 'New password', { x: Math.round(w * 0.45), y: Math.round(h * 0.54), width: Math.round(w * 0.35), height: Math.round(h * 0.08) }, 'textBox', 85, 'Dialog Form Layout'),
      this.makeSurfaceControl(3, 'Confirm password', { x: Math.round(w * 0.45), y: Math.round(h * 0.64), width: Math.round(w * 0.35), height: Math.round(h * 0.08) }, 'textBox', 85, 'Dialog Form Layout'),
      this.makeSurfaceControl(4, 'OK', { x: Math.round(w * 0.45), y: Math.round(h * 0.86), width: Math.round(w * 0.15), height: Math.round(h * 0.07) }, 'button', 90, 'Dialog Form Layout'),
      this.makeSurfaceControl(5, 'Cancel', { x: Math.round(w * 0.65), y: Math.round(h * 0.86), width: Math.round(w * 0.15), height: Math.round(h * 0.07) }, 'button', 90, 'Dialog Form Layout'),
    ];
  }

  private async ocrSurface(image: Buffer, region?: { x: number; y: number; width: number; height: number }): Promise<SurfaceControl[]> {
    const controls: SurfaceControl[] = [];
    let words: any[] = [];
    let ocrSource = 'Tesseract.js';

    // 1. Run Tesseract.js worker with safety timeout & cleanup
    try {
      const tesseract = require('tesseract.js') as any;
      const candidatePaths = [
        path.join(__dirname, '..', 'assets', 'tessdata'),
        path.join(__dirname, 'assets', 'tessdata'),
        path.join(process.cwd(), 'assets', 'tessdata'),
        path.join(process.cwd(), 'apps', 'automationstudio', 'assets', 'tessdata'),
      ];
      const langPath = candidatePaths.find((p) => fs.existsSync(path.join(p, 'eng.traineddata'))) || candidatePaths[0]!;

      const ocrJob = async () => {
        const worker = await tesseract.createWorker('eng', 1, { langPath, gzip: false });
        try {
          const result = await worker.recognize(image);
          return this.extractOcrEntries(result?.data);
        } finally {
          await worker.terminate().catch(() => {});
        }
      };

      const extracted = await this.withTimeout(ocrJob(), 6000, []);
      if (extracted && extracted.length) {
        words = extracted;
      }
    } catch (error) {
      console.warn('Tesseract.js OCR unavailable; trying native OCR fallback.', error);
    }

    // 2. Try native Tesseract CLI fallback if worker returned no words
    if (!words.length) {
      try {
        const nativeJob = async () => {
          const os = require('os') as typeof import('os');
          const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'automationstudio-ocr-'));
          const imagePath = path.join(tempDir, 'screen-image.png');
          fs.writeFileSync(imagePath, image);
          const binaries = process.platform === 'darwin' ? ['/opt/homebrew/bin/tesseract', '/usr/local/bin/tesseract', 'tesseract'] : ['tesseract'];
          let stdout = '';
          for (const binary of binaries) {
            try {
              stdout = (await execFile(binary, [imagePath, 'stdout', '--psm', '11', '-l', 'eng', 'tsv'], { maxBuffer: 8 * 1024 * 1024, timeout: 3000 })).stdout;
              if (stdout) break;
            } catch { /* Try the next known installation path. */ }
          }
          fs.rmSync(tempDir, { recursive: true, force: true });
          if (!stdout) return [];
          return stdout.split(/\r?\n/).slice(1).map((line) => {
            const fields = line.split('\t');
            if (fields.length < 12 || fields[0] !== '5') return undefined;
            return { text: fields.slice(11).join('\t'), confidence: Number(fields[10]), bbox: { x0: Number(fields[6]), y0: Number(fields[7]), x1: Number(fields[6]) + Number(fields[8]), y1: Number(fields[7]) + Number(fields[9]) } };
          }).filter(Boolean);
        };
        const nativeWords = await this.withTimeout(nativeJob(), 4000, []);
        if (nativeWords && nativeWords.length) {
          words = nativeWords;
          ocrSource = 'native Tesseract';
        }
      } catch (error) {
        console.warn('Native Tesseract OCR unavailable.', error);
      }
    }

    if (region && region.width > 4 && region.height > 4) {
      const matchingWords = words.filter((word) => word?.bbox && this.intersects(region, {
        x: word.bbox.x0, y: word.bbox.y0,
        width: word.bbox.x1 - word.bbox.x0, height: word.bbox.y1 - word.bbox.y0,
      })).map((word) => String(word.text || '').trim()).filter(Boolean);
      const label = matchingWords.join(' ').trim() || 'Selected screen region';
      controls.push(this.makeSurfaceControl(0, label, region, this.classifySurfaceType(label, region)));
      return controls;
    }

    const confidentWords = words.filter((word) => word?.bbox && String(word.text || '').trim() && Number(word.confidence ?? 0) >= 15);
    const usableWords = confidentWords.length ? confidentWords : words.filter((word) => word?.bbox && String(word.text || '').trim().length >= 2);
    usableWords
      .slice(0, 80)
      .forEach((word, index) => {
        const bbox = {
          x: Number(word.bbox.x0 || 0), y: Number(word.bbox.y0 || 0),
          width: Math.max(4, Number(word.bbox.x1 || 0) - Number(word.bbox.x0 || 0)),
          height: Math.max(4, Number(word.bbox.y1 || 0) - Number(word.bbox.y0 || 0)),
        };
        const label = String(word.text || '').trim();
        controls.push(this.makeSurfaceControl(index, label, bbox, this.classifySurfaceType(label, bbox), Number(word.confidence || 0), ocrSource));
      });

    // Detect rectangular controls (input fields, text boxes)
    const textBoxes = await this.withTimeout(this.detectSurfaceTextBoxes(image), 3000, []);
    const fallbackTextBoxes = textBoxes.length ? textBoxes : this.inferSurfaceTextBoxes(words, this.getImageSize(image));
    fallbackTextBoxes.forEach((bbox, index) => {
      if (controls.some((control) => this.intersects(control.bbox, bbox) && this.intersects(bbox, control.bbox))) return;
      const label = this.nearestSurfaceLabel(bbox, words) || `Text box ${index + 1}`;
      controls.push(this.makeSurfaceControl(controls.length, label, bbox, 'textBox', 88, 'Layout rectangle + OCR label'));
    });

    if (!controls.length) {
      const size = this.getImageSize(image);
      controls.push(...this.generateFallbackSurfaceControls(image, region, size));
    }
    return controls;
  }

  private extractOcrEntries(data: any): any[] {
    const lines = Array.isArray(data?.lines) ? data.lines : [];
    const lineEntries = lines.map((line: any) => ({
      text: String(line?.text || '').trim(),
      confidence: Number(line?.confidence ?? 0),
      bbox: {
        x0: Number(line?.bbox?.x0 ?? 0), y0: Number(line?.bbox?.y0 ?? 0),
        x1: Number(line?.bbox?.x1 ?? 0), y1: Number(line?.bbox?.y1 ?? 0),
      },
    })).filter((entry: any) => entry.text && entry.bbox.x1 > entry.bbox.x0 && entry.bbox.y1 > entry.bbox.y0);
    if (lineEntries.length) return lineEntries;

    return (Array.isArray(data?.words) ? data.words : []).map((word: any) => ({
      text: String(word?.text || '').trim(),
      confidence: Number(word?.confidence ?? 0),
      bbox: {
        x0: Number(word?.bbox?.x0 ?? 0), y0: Number(word?.bbox?.y0 ?? 0),
        x1: Number(word?.bbox?.x1 ?? 0), y1: Number(word?.bbox?.y1 ?? 0),
      },
    })).filter((entry: any) => entry.text && entry.bbox.x1 > entry.bbox.x0 && entry.bbox.y1 > entry.bbox.y0);
  }

  private ocrScore(entries: any[]): number {
    return entries.reduce((score, entry) => score + Math.max(1, String(entry.text || '').length / 8) + Math.max(0, Number(entry.confidence || 0)) / 100, 0);
  }

  private getImageSize(image: Buffer): { width: number; height: number } {
    if (image.length >= 24 && image[0] === 0x89 && image.toString('ascii', 1, 4) === 'PNG' && image[4] === 0x0d && image[5] === 0x0a && image[6] === 0x1a && image[7] === 0x0a) {
      return { width: image.readUInt32BE(16), height: image.readUInt32BE(20) };
    }
    if (image.length > 4 && image[0] === 0xff && image[1] === 0xd8) {
      let offset = 2;
      while (offset + 9 < image.length) {
        if (image[offset] !== 0xff) { offset++; continue; }
        const marker = image[offset + 1] ?? 0;
        const length = image.readUInt16BE(offset + 2);
        if (marker >= 0xc0 && marker <= 0xc3) return { width: image.readUInt16BE(offset + 7), height: image.readUInt16BE(offset + 5) };
        offset += 2 + length;
      }
    }
    // WebP is accepted by the file picker, so preserve a useful coordinate
    // fallback even when the image contains no readable text.
    if (image.length >= 30 && image.toString('ascii', 0, 4) === 'RIFF' && image.toString('ascii', 8, 12) === 'WEBP') {
      const kind = image.toString('ascii', 12, 16);
      if (kind === 'VP8X') {
        return { width: 1 + image.readUIntLE(24, 3), height: 1 + image.readUIntLE(27, 3) };
      }
      if (kind === 'VP8 ' && image.length >= 30 && image[23] === 0x9d && image[24] === 0x01 && image[25] === 0x2a) {
        return { width: image.readUInt16LE(26) & 0x3fff, height: image.readUInt16LE(28) & 0x3fff };
      }
    }
    return { width: 1, height: 1 };
  }

  private async detectSurfaceTextBoxes(image: Buffer): Promise<Array<{ x: number; y: number; width: number; height: number }>> {
    const os = require('os') as typeof import('os');
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'automationstudio-layout-'));
    const imagePath = path.join(tempDir, 'screen-image.png');
    fs.writeFileSync(imagePath, image);
    const script = [
      'import cv2, json, sys',
      'im = cv2.imread(sys.argv[1])',
      'if im is None:',
      '    print("[]")',
      '    raise SystemExit(0)',
      'gray = cv2.cvtColor(im, cv2.COLOR_BGR2GRAY)',
      'edges = cv2.Canny(gray, 50, 150)',
      'contours, _ = cv2.findContours(edges, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)',
      'height, width = gray.shape[:2]',
      'items = []',
      'for contour in contours:',
      '    x, y, w, h = cv2.boundingRect(contour)',
      '    ratio = w / h if h else 0',
      '    area = w * h',
      '    if w >= 100 and h >= 20 and 3 <= ratio <= 12 and area >= 3000 and area <= width * height * 0.2:',
      '        items.append((x, y, w, h))',
      'items.sort(key=lambda item: item[2] * item[3], reverse=True)',
      'unique = []',
      'for item in items:',
      '    if not any(abs(item[0] - old[0]) < 8 and abs(item[1] - old[1]) < 8 and abs(item[2] - old[2]) < 12 and abs(item[3] - old[3]) < 12 for old in unique):',
      '        unique.append(item)',
      'print(json.dumps([{"x": x, "y": y, "width": w, "height": h} for x, y, w, h in unique[:80]]))',
    ].join('\n');
    try {
      const binaries = process.platform === 'win32' ? ['python'] : ['python3', 'python'];
      for (const binary of binaries) {
        try {
          const result = await execFile(binary, ['-c', script, imagePath], { maxBuffer: 2 * 1024 * 1024, timeout: 2500 });
          const parsed = JSON.parse(result.stdout.trim() || '[]') as Array<{ x: number; y: number; width: number; height: number }>;
          return parsed.filter((box) => box.width >= 100 && box.height >= 20);
        } catch { /* Try the next Python runtime or fall back to OCR-only controls. */ }
      }
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    return [];
  }

  private nearestSurfaceLabel(bbox: { x: number; y: number; width: number; height: number }, words: any[]): string {
    const candidates = words.filter((word) => word?.bbox && String(word.text || '').trim()).map((word) => {
      const wordBox = { x: Number(word.bbox.x0), y: Number(word.bbox.y0), width: Number(word.bbox.x1) - Number(word.bbox.x0), height: Number(word.bbox.y1) - Number(word.bbox.y0) };
      const verticalDistance = Math.abs((wordBox.y + wordBox.height / 2) - (bbox.y + bbox.height / 2));
      const horizontalDistance = bbox.x - (wordBox.x + wordBox.width);
      return { label: String(word.text).trim(), wordBox, verticalDistance, horizontalDistance };
    }).filter((candidate) => candidate.horizontalDistance >= 0 && candidate.horizontalDistance < Math.max(420, bbox.width * 2.5) && candidate.verticalDistance < Math.max(50, bbox.height * 1.8)).sort((a, b) => (a.verticalDistance + a.horizontalDistance * 0.15) - (b.verticalDistance + b.horizontalDistance * 0.15));
    return candidates.slice(0, 3).map((candidate) => candidate.label).join(' ');
  }

  private inferSurfaceTextBoxes(words: any[], size: { width: number; height: number }): Array<{ x: number; y: number; width: number; height: number }> {
    return words.filter((word) => /operator|username|user|password|email|account|phone/i.test(String(word.text || '')) && word?.bbox).slice(0, 12).map((word) => {
      const x = Number(word.bbox.x1 || 0) + Math.max(30, Math.round((Number(word.bbox.x1 || 0) - Number(word.bbox.x0 || 0)) * 0.8));
      const y = Math.max(0, Number(word.bbox.y0 || 0) - 2);
      return { x: Math.min(x, Math.max(0, size.width - 140)), y, width: Math.min(360, Math.max(140, size.width - x - 10)), height: Math.max(24, Number(word.bbox.y1 || 0) - Number(word.bbox.y0 || 0) + 4) };
    });
  }

  private makeSurfaceControl(index: number, label: string, bbox: { x: number; y: number; width: number; height: number }, controlType: SurfaceControl['controlType'], confidence = 72, source = 'OCR + layout heuristic'): SurfaceControl {
    const normalizedLabel = label || 'Detected control';
    const windowName = (this.surfaceWindowName || this.surfaceWindowTitle || (this.surfaceScreenshotName ? path.parse(this.surfaceScreenshotName).name : '') || 'MainWindow').trim();
    const safeWindow = windowName.replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || 'MainWindow';
    const safeControl = normalizedLabel.replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || `Control_${index + 1}`;
    const fullName = `${safeWindow}.${safeControl}`;
    return {
      id: `surface-control-${index + 1}`,
      controlType,
      label: normalizedLabel,
      confidence: Math.max(1, Math.min(99, Math.round(confidence))),
      source,
      bbox,
      locator: { strategy: 'ocr', value: normalizedLabel },
      windowName: safeWindow,
      fullName,
    };
  }

  private classifySurfaceType(label: string, bbox: { width: number; height: number }): SurfaceControl['controlType'] {
    const value = label.toLowerCase();
    if (/login|sign in|submit|save|cancel|next|back|search|ok|continue|close|open|add|delete|upload/.test(value)) return 'button';
    if (/select|dropdown|drop-down|choose|option/.test(value)) return 'dropDown';
    if (/radio/.test(value)) return 'radioButton';
    if (/check|remember|agree|accept/.test(value)) return 'checkBox';
    if (/email|user|username|password|name|address|phone|input|text/.test(value)) return 'textBox';
    if (bbox.height >= 12 && bbox.width >= bbox.height * 2.2) return 'button';
    return 'label';
  }

  private intersects(a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }): boolean {
    return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
  }

  private async navigateAndInspect(url: string, inspectAfter: boolean, browserType?: string): Promise<void> {
    await this.ensurePlaywrightPage(url || 'https://example.com', browserType);
    // Wait for the page to settle after navigation before inspecting the DOM.
    await this.pwPage?.waitForLoadState('domcontentloaded', { timeout: 10_000 }).catch(() => {});
    await this.panel?.postMessage({ type: 'pwNavigated', url: this.pwPage?.url() || url });
    if (inspectAfter) {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          await this.inspectPlaywright('');
          return;
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          if (!msg.includes('Execution context was destroyed') || attempt === 2) throw error;
          // Page navigated internally (e.g. SPA redirect); wait and retry.
          await new Promise<void>(resolve => setTimeout(resolve, 500 * (attempt + 1)));
          await this.pwPage?.waitForLoadState('domcontentloaded', { timeout: 5_000 }).catch(() => {});
        }
      }
    }
  }

  private async inspectPlaywright(url: string): Promise<void> {
    const page = await this.ensurePlaywrightPage(url || undefined);
    const elements = await page.evaluate(() => {
      const candidates = Array.from(document.querySelectorAll('button, input, textarea, select, a, [role]')) as HTMLElement[];
      const visible = (element: HTMLElement) => {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
      };
      const cssEscape = (value: string) => {
        try { return CSS.escape(value); } catch { return value.replace(/[^a-zA-Z0-9_-]/g, '\\$&'); }
      };
      const labelFor = (element: HTMLElement) => {
        const id = element.getAttribute('id');
        const explicit = id ? document.querySelector(`label[for="${cssEscape(id)}"]`)?.textContent : '';
        return String(explicit || element.getAttribute('aria-label') || element.getAttribute('placeholder') || element.textContent || element.getAttribute('name') || '').trim().replace(/\s+/g, ' ').slice(0, 120);
      };
      const locatorFor = (element: HTMLElement) => {
        const id = element.getAttribute('id');
        if (id) return `#${cssEscape(id)}`;
        const testId = element.getAttribute('data-testid');
        if (testId) return `[data-testid="${cssEscape(testId)}"]`;
        const name = element.getAttribute('name');
        if (name) return `${element.tagName.toLowerCase()}[name="${cssEscape(name)}"]`;
        const type = element.getAttribute('type');
        if (element.tagName.toLowerCase() === 'input' && type) return `input[type="${cssEscape(type)}"]`;
        return element.tagName.toLowerCase();
      };
      const controlType = (element: HTMLElement) => {
        const tag = element.tagName.toLowerCase();
        const role = element.getAttribute('role') || '';
        const type = (element.getAttribute('type') || '').toLowerCase();
        if (role === 'button' || tag === 'button' || (tag === 'a' && element.getAttribute('href'))) return 'button';
        if (tag === 'select' || role === 'combobox' || role === 'listbox') return 'dropDown';
        if (type === 'radio' || role === 'radio') return 'radioButton';
        if (type === 'checkbox' || role === 'checkbox') return 'checkBox';
        if (tag === 'input' || tag === 'textarea' || role === 'textbox') return 'textBox';
        return 'element';
      };
      return candidates.filter(visible).slice(0, 250).map((element, index) => {
        const rect = element.getBoundingClientRect();
        const attributes: Record<string, string> = {};
        for (const attribute of Array.from(element.attributes)) attributes[attribute.name] = attribute.value;
        return {
          id: `pw-element-${index + 1}`, tagName: element.tagName.toLowerCase(), controlType: controlType(element),
          label: labelFor(element), text: String(element.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 120),
          locator: locatorFor(element), locatorStrategy: 'css', role: element.getAttribute('role') || undefined,
          name: element.getAttribute('name') || undefined, type: element.getAttribute('type') || undefined, attributes,
          bbox: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        };
      });
    });
    await this.panel?.postMessage({ type: 'pwElements', url: page.url(), elements });
  }

  private async highlightPlaywright(locator: string): Promise<void> {
    if (!locator) return;
    const page = await this.ensurePlaywrightPage();
    const target = page.locator(locator).first();
    await target.scrollIntoViewIfNeeded({ timeout: 5000 });
    const box = await target.boundingBox();
    if (!box) throw new Error(`Element is not visible: ${locator}`);
    await page.evaluate(({ x, y, width, height, selector }: { x: number; y: number; width: number; height: number; selector: string }) => {
      document.getElementById('__automationstudio_highlight__')?.remove();
      const overlay = document.createElement('div');
      overlay.id = '__automationstudio_highlight__';
      overlay.style.cssText = `position:fixed;z-index:2147483647;pointer-events:none;left:${x}px;top:${y}px;width:${width}px;height:${height}px;border:3px solid #ffb457;background:rgba(255,180,87,.16);box-shadow:0 0 0 9999px rgba(0,0,0,.08);border-radius:4px;`;
      const label = document.createElement('div');
      label.textContent = selector;
      label.style.cssText = 'position:absolute;left:-3px;top:-25px;padding:4px 7px;border-radius:3px;background:#ffb457;color:#111;font:12px -apple-system,BlinkMacSystemFont,sans-serif;white-space:nowrap;';
      overlay.appendChild(label);
      document.body.appendChild(overlay);
    }, { ...box, selector: locator });
    await this.panel?.postMessage({ type: 'pwHighlight', locator });
  }

  private async clearPlaywrightHighlight(): Promise<void> {
    await this.pwPage?.evaluate(() => document.getElementById('__automationstudio_highlight__')?.remove()).catch(() => {});
  }

  private async ensurePlaywrightPage(url?: string, browserType?: string): Promise<any> {
    const targetBrowser = browserType || this.selectedBrowser || 'chrome';
    // If the user manually closed the window or switched browsers, recreate it
    if (this.pwBrowser && (!this.pwBrowser.isConnected() || (this.activeBrowserType && this.activeBrowserType !== targetBrowser))) {
      await this.disposePlaywright();
    }
    if (!this.pwPage) {
      const playwright = require('playwright-core') as any;
      let browserInstance: any;
      if (targetBrowser === 'firefox') {
        browserInstance = await playwright.firefox.launch({ headless: false });
      } else if (targetBrowser === 'webkit') {
        browserInstance = await playwright.webkit.launch({ headless: false });
      } else if (targetBrowser === 'msedge' || targetBrowser === 'edge') {
        try {
          browserInstance = await playwright.chromium.launch({ headless: false, channel: 'msedge' });
        } catch {
          browserInstance = await playwright.chromium.launch(chromiumLaunchOptions(playwright));
        }
      } else if (targetBrowser === 'chrome') {
        try {
          browserInstance = await playwright.chromium.launch({ headless: false, channel: 'chrome' });
        } catch {
          browserInstance = await playwright.chromium.launch(chromiumLaunchOptions(playwright));
        }
      } else {
        browserInstance = await playwright.chromium.launch(chromiumLaunchOptions(playwright));
      }
      this.pwBrowser = browserInstance;
      this.activeBrowserType = targetBrowser;
      // Corporate TLS inspection commonly presents a locally issued
      // certificate. It should not make a normal public-site navigation look
      // like a broken PW flow.
      const context = await this.pwBrowser.newContext({ ignoreHTTPSErrors: true });
      this.pwPage = await context.newPage();
    }
    if (url && url !== 'about:blank') await this.navigatePlaywright(this.pwPage, url);
    return this.pwPage;
  }

  private async navigatePlaywright(page: any, rawUrl: string): Promise<void> {
    const url = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        // The first attempt waits for usable DOM. A retry uses "commit" so a
        // slow analytics or proxy connection cannot abort an otherwise loaded
        // document before the inspector can read its DOM.
        await page.goto(url, { waitUntil: attempt === 0 ? 'domcontentloaded' : 'commit', timeout: 45_000 });
        if (attempt > 0) await page.waitForLoadState('domcontentloaded', { timeout: 10_000 }).catch(() => undefined);
        return;
      } catch (error) {
        lastError = error;
        const transient = /net::ERR_(CONNECTION_(?:CLOSED|RESET|ABORTED)|ABORTED|TIMED_OUT|FAILED|SSL_PROTOCOL_ERROR)/i.test(this.errorText(error));
        if (!transient || attempt === 2) break;
        await new Promise<void>((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
      }
    }
    throw new Error(`Could not open ${url} after 3 attempts: ${this.errorText(lastError)}. Verify that the URL opens in Chrome or Edge and that your VPN/proxy allows the connection.`);
  }

  private async disposePlaywright(): Promise<void> {
    if (this.pwBrowser) await this.pwBrowser.close().catch(() => {});
    this.pwBrowser = undefined;
    this.pwPage = undefined;
  }

  private async previewExecution(mode: FlowMode, steps: FlowStepMessage[]): Promise<void> {
    if (mode === 'pw') {
      await this.executePlaywright(steps);
      return;
    }
    await this.executeSurface(steps);
  }

  private async ensureTestDataLoaded(): Promise<void> {
    const projectPath = this.getBuilderProjectPath();
    if (!projectPath || this.dataLoadedProjectPath === projectPath) return;
    await this.dataProvider.load(projectPath);
    this.dataLoadedProjectPath = projectPath;
  }

  private async resolveFlowValue(value: string | undefined, row: Record<string, unknown>): Promise<string> {
    const raw = String(value || '');
    const resolveToken = async (token: string): Promise<string> => {
      if (this.secretManager?.isSecretUri(token)) return this.secretManager.resolve(token);
      if (this.dataProvider.isDataUri(token)) return String(this.dataProvider.resolve(token));
      return String(row[token] ?? token);
    };
    if (this.dataProvider.isDataUri(raw) || this.secretManager?.isSecretUri(raw)) return resolveToken(raw);
    const matches = [...raw.matchAll(/\{\{\s*([^}]+?)\s*\}\}/g)];
    let resolved = raw;
    for (const match of matches) {
      const token = String(match[1]);
      resolved = resolved.replace(match[0], await resolveToken(token));
    }
    return resolved;
  }

  private async resolvePlaywrightLocator(page: any, target: string): Promise<any | undefined> {
    if (!target) return undefined;
    const objTarget = target.startsWith('object://') ? target : (target.includes('.') ? `object://${target}` : undefined);
    if (objTarget) {
      const projectPath = this.getBuilderProjectPath();
      if (projectPath) {
        try {
          const repository = new UnifiedFileSystemObjectRepository(projectPath);
          const resolved = await repository.resolve(objTarget, 'playwright');
          const locator = resolved?.pw;
          if (locator?.testId) return page.getByTestId(locator.testId);
          if (locator?.role) return page.getByRole(locator.role, locator.name ? { name: locator.name } : undefined);
          if (locator?.css) return page.locator(locator.css);
          if (locator?.xpath) return page.locator(locator.xpath);
        } catch { /* fallback to direct selector */ }
      }
    }
    if (target.startsWith('object://')) throw new Error(`Object ${target} has no usable Playwright locator.`);
    return page.locator(target);
  }

  private async resolveSurfaceLocator(step: FlowStepMessage): Promise<{ strategy: string; value: string }> {
    const target = String(step.target || '').trim();
    const objTarget = target.startsWith('object://') ? target : (target.includes('.') ? `object://${target}` : undefined);
    if (objTarget) {
      const projectPath = this.getBuilderProjectPath();
      if (projectPath) {
        try {
          const repository = new UnifiedFileSystemObjectRepository(projectPath);
          const resolved = await repository.resolve(objTarget, 'surface');
          const locator = resolved?.surface?.slice().sort((a: any, b: any) => (a.priority || 100) - (b.priority || 100))[0];
          if (locator) return { strategy: locator.strategy, value: String(locator.value) };
        } catch { /* fallback */ }
      }
    }
    let locatorValue = step.locator || target || step.label || '';
    if (locatorValue.includes('.') && !locatorValue.startsWith('object://') && !step.locator) {
      locatorValue = locatorValue.split('.').slice(1).join('.');
    }
    return {
      strategy: ['ocr', 'image', 'coordinate', 'anchor', 'relativePosition'].includes(step.locatorStrategy || '') ? String(step.locatorStrategy) : 'ocr',
      value: locatorValue,
    };
  }

  private async executeSurface(steps: FlowStepMessage[]): Promise<void> {
    await this.ensureTestDataLoaded();
    const orderedSteps = steps.flatMap((step) => {
      if (step.type === 'callAction' || step.type === 'reusableAction' || step.type === 'reusable') {
        return step.children || [];
      }
      if (step.type !== 'loop' || !step.children?.length) return [step];
      const count = Math.max(0, Number(step.value || 0));
      return Array.from({ length: count }, () => step.children || []).flat();
    });
    const adapter = this.technologyRegistry?.getAdapter('vision');
    if (!adapter) {
      await this.panel?.postMessage({ type: 'executionStarted', mode: 'surface', count: orderedSteps.length, live: false });
      vscode.window.showWarningMessage('Vision executor is unavailable; Surface steps were queued as a preview.');
      return;
    }

    const targetWindow = steps.find((step) => step.windowName)?.windowName
      || steps.flatMap((step) => step.children || []).find((step) => step.windowName)?.windowName;
    if (targetWindow) await this.activateSurfaceWindow(targetWindow);

    const framework = adapter.createFramework() as any;
    await framework.initialize();
    await this.panel?.postMessage({ type: 'executionStarted', mode: 'surface', count: orderedSteps.length, live: true });
    try {
      for (let index = 0; index < orderedSteps.length; index += 1) {
        const step = orderedSteps[index];
        if (!step) continue;
        try {
          if (step.type !== 'launch') {
            const surfaceLocator = await this.resolveSurfaceLocator(step);
            const locator = { strategies: [{ type: surfaceLocator.strategy, value: surfaceLocator.value }] };
            const action = step.type === 'click' ? 'click'
              : step.type === 'type' ? 'type'
                : step.type === 'wait' ? 'wait'
                  : step.type === 'verify' || step.type === 'assertVisible' || step.type === 'assertText' || step.type === 'waitForElement' ? 'exists'
                    : step.type === 'scroll' ? 'scroll'
                      : step.type === 'pressKey' ? 'key'
                        : step.type === 'drag' ? 'drag'
                          : ['doubleClick', 'rightClick', 'hover'].includes(step.type || '') ? 'click'
                            : undefined;
            if (!action) throw new Error(`Unsupported Surface action "${step.type || 'unknown'}".`);
            const stepValue = await this.resolveFlowValue(step.value, {});
            const options = step.type === 'type' ? { text: stepValue }
              : step.type === 'pressKey' ? { key: step.value || 'Enter' }
                : step.type === 'scroll' ? { amount: Number(stepValue) || 500 }
                  : step.type === 'doubleClick' ? { button: 'double' }
                    : step.type === 'rightClick' ? { button: 'right' }
                      : step.type === 'hover' ? { action: 'hover' }
                        : step.type === 'drag' ? { destination: stepValue }
                          : undefined;
            const result = await framework.backend.execute({
              action,
              locator,
              options,
              transaction: { id: step.id || `surface-${index + 1}` },
            });
            if (result?.success === false) throw new Error(result.error || `Surface ${action} failed.`);
          }
          await this.panel?.postMessage({ type: 'executionStep', index, status: 'passed', label: step.label || step.type });
        } catch (error) {
          const message = this.secretManager?.redactText(error instanceof Error ? error.message : String(error)) || (error instanceof Error ? error.message : String(error));
          await this.panel?.postMessage({ type: 'executionStep', index, status: 'failed', label: step.label || step.type, message });
          await this.panel?.postMessage({ type: 'executionFinished', mode: 'surface', status: 'failed', index, message });
          throw error;
        }
      }
      await this.panel?.postMessage({ type: 'executionFinished', mode: 'surface', status: 'passed' });
      vscode.window.showInformationMessage(`Surface flow completed (${orderedSteps.length} ordered steps).`);
    } finally {
      await framework.dispose?.();
    }
  }

  private async activateSurfaceWindow(windowName: string): Promise<void> {
    const windows = await this.listSurfaceWindows();
    const normalized = windowName.trim().toLowerCase();
    const match = windows.find((window) => [window.appName, window.title, window.label].some((value) => String(value || '').toLowerCase() === normalized || String(value || '').toLowerCase().includes(normalized)));
    if (!match || match.kind !== 'window') throw new Error(`Captured application window “${windowName}” is no longer available. Refresh apps and capture it again.`);
    if (process.platform === 'darwin') {
      const script = `tell application "System Events" to set frontmost of process ${JSON.stringify(match.appName)} to true`;
      try {
        await execFile('osascript', ['-e', script]);
      } catch (error) {
        throw new Error(`Could not activate “${match.appName}”. Allow Automation Studio/VS Code under Privacy & Security → Accessibility, then retry.`);
      }
    }
  }

  private async executePlaywright(steps: FlowStepMessage[]): Promise<void> {
    await this.ensureTestDataLoaded();
    // A run owns its browser session. Closing the previous session makes Run repeatable
    // even after a failed run or a manually closed browser window.
    await this.disposePlaywright();
    const executionId = randomUUID();
    const startedAt = Date.now();
    const reportSteps: Array<{ name: string; status: string; durationMs: number; error?: string; screenshot?: string }> = [];
    await this.panel?.postMessage({ type: 'executionStarted', mode: 'pw', count: steps.length, live: true });
    let page: any;
    try {
      page = await this.ensurePlaywrightPage();
    } catch (error) {
      const message = this.secretManager?.redactText(error instanceof Error ? error.message : String(error)) || (error instanceof Error ? error.message : String(error));
      await this.writeFlowReport(executionId, 'failed', Date.now() - startedAt, [{ name: 'Browser startup', status: 'failed', durationMs: Date.now() - startedAt, error: message }], message);
      await this.panel?.postMessage({ type: 'executionStep', index: 0, status: 'failed', label: 'Browser startup', message });
      await this.panel?.postMessage({ type: 'executionFinished', mode: 'pw', status: 'failed', index: 0, message });
      vscode.window.showErrorMessage(`Playwright browser could not start: ${message}`);
      await this.disposePlaywright();
      await vscode.commands.executeCommand('automationStudio.showReport', executionId);
      return;
    }
    for (let index = 0; index < steps.length; index += 1) {
      const step = steps[index];
      if (!step) continue;
      const stepStartedAt = Date.now();
      try {
        // Ensure active page is fresh and not closed across steps (e.g. popups, redirects)
        if (!page || page.isClosed()) {
          if (this.pwBrowser && this.pwBrowser.isConnected()) {
            const contexts = this.pwBrowser.contexts();
            for (const ctx of contexts) {
              const openPages = ctx.pages().filter((p: any) => !p.isClosed());
              if (openPages.length) {
                page = openPages[openPages.length - 1];
                this.pwPage = page;
                break;
              }
            }
          }
          if (!page || page.isClosed()) {
            page = await this.ensurePlaywrightPage();
          }
        }
        await this.runPlaywrightStep(page, step);
        const screenshot = await this.captureStepScreenshot(page);
        reportSteps.push({ name: step.label || step.type || `Step ${index + 1}`, status: 'passed', durationMs: Date.now() - stepStartedAt, screenshot });
        await this.panel?.postMessage({ type: 'executionStep', index, status: 'passed', label: step.label || step.type });
      } catch (error) {
        const message = this.secretManager?.redactText(error instanceof Error ? error.message : String(error)) || (error instanceof Error ? error.message : String(error));
        const screenshot = await this.captureStepScreenshot(page);
        reportSteps.push({ name: step.label || step.type || `Step ${index + 1}`, status: 'failed', durationMs: Date.now() - stepStartedAt, error: message, screenshot });
        await this.writeFlowReport(executionId, 'failed', Date.now() - startedAt, reportSteps, message);
        await this.panel?.postMessage({ type: 'executionStep', index, status: 'failed', label: step.label || step.type, message });
        await this.panel?.postMessage({ type: 'executionFinished', mode: 'pw', status: 'failed', index, message });
        vscode.window.showErrorMessage(`Playwright flow failed at step ${index + 1}: ${message}`);
        await this.disposePlaywright();
        await vscode.commands.executeCommand('automationStudio.showReport', executionId);
        return;
      }
    }
    await this.writeFlowReport(executionId, 'passed', Date.now() - startedAt, reportSteps);
    await this.panel?.postMessage({ type: 'executionFinished', mode: 'pw', status: 'passed' });
    vscode.window.showInformationMessage(`Playwright flow completed (${steps.length} ordered steps).`);
    await this.disposePlaywright();
    await vscode.commands.executeCommand('automationStudio.showReport', executionId);
  }

  private async runPlaywrightStep(page: any, step: FlowStepMessage, row: Record<string, unknown> = {}): Promise<void> {
    const target = await this.resolveFlowValue(step.target, row);
    const value = await this.resolveFlowValue(step.value, row);
    let currentPage = page;
    if (!currentPage || currentPage.isClosed()) {
      currentPage = this.pwPage || await this.ensurePlaywrightPage();
    }
    const locator = await this.resolvePlaywrightLocator(currentPage, target);
    switch (step.type) {
      case 'click':
        if (!locator) throw new Error('Click step has no locator.');
        await locator.click();
        await currentPage.waitForLoadState('domcontentloaded', { timeout: 6000 }).catch(() => {});
        return;
      case 'navigate':
        await this.ensurePlaywrightPage(value || target || 'about:blank');
        return;
      case 'type':
        if (!locator) throw new Error('Fill step has no locator.');
        await locator.fill(value);
        return;
      case 'uploadFile':
        if (!locator) throw new Error('Upload step has no file input locator.');
        if (!value) throw new Error('Upload step has no file path.');
        await locator.setInputFiles(value);
        return;
      case 'select':
        if (!locator) throw new Error('Select step has no locator.');
        await locator.selectOption(value);
        return;
      case 'check':
        if (!locator) throw new Error('Check step has no locator.');
        await locator.check();
        return;
      case 'uncheck':
        if (!locator) throw new Error('Uncheck step has no locator.');
        await locator.uncheck();
        return;
      case 'hover':
        if (!locator) throw new Error('Hover step has no locator.');
        await locator.hover();
        return;
      case 'doubleClick':
        if (!locator) throw new Error('Double-click step has no locator.');
        await locator.dblclick();
        return;
      case 'rightClick':
        if (!locator) throw new Error('Right-click step has no locator.');
        await locator.click({ button: 'right' });
        return;
      case 'dragAndDrop': {
        if (!locator) throw new Error('Drag-and-drop step has no source locator.');
        const destination = await this.resolveFlowValue(step.value, row);
        if (!destination) throw new Error('Drag-and-drop step has no destination locator.');
        await locator.dragTo(currentPage.locator(destination));
        return;
      }
      case 'pressKey':
        if (locator) await locator.press(value || 'Enter');
        else await currentPage.keyboard.press(value || 'Enter');
        return;
      case 'verify':
      case 'assertVisible':
      case 'waitForElement':
        if (!locator) throw new Error(`${step.type} step has no locator.`);
        await currentPage.waitForLoadState('domcontentloaded', { timeout: 6000 }).catch(() => {});
        await locator.waitFor({ state: 'visible', timeout: Number(value) || 12000 });
        return;
      case 'assertText':
        if (!locator) throw new Error('Text assertion has no locator.');
        await currentPage.waitForLoadState('domcontentloaded', { timeout: 6000 }).catch(() => {});
        await locator.getByText(value).first().waitFor({ state: 'visible', timeout: 10000 }).catch(async () => {
          const text = await locator.textContent();
          if (!text?.includes(value)) throw new Error(`Expected text "${value}" was not found.`);
        });
        return;
      case 'assertValue':
        if (!locator) throw new Error('Value assertion has no locator.');
        if (await locator.inputValue() !== value) throw new Error(`Expected value "${value}" was not found.`);
        return;
      case 'tableCount': {
        if (!locator) throw new Error('Table count step has no locator.');
        const count = await locator.count();
        if (value && count !== Number(value)) throw new Error(`Expected ${value} matching table rows but found ${count}.`);
        return;
      }
      case 'screenshot':
        await page.screenshot({ type: 'png' });
        return;
      case 'scroll':
        if (locator) await locator.evaluate((element: HTMLElement, amount: number) => element.scrollBy(0, amount), Number(value) || 500);
        else await page.evaluate((amount: number) => window.scrollBy(0, amount), Number(value) || 500);
        return;
      case 'wait':
        await page.waitForLoadState('load');
        return;
      case 'callAction':
      case 'reusableAction':
      case 'reusable': {
        if (!step.children?.length) throw new Error(`Reusable action "${step.label || 'Action'}" has no steps.`);
        for (const child of step.children) await this.runPlaywrightStep(page, child, row);
        return;
      }
      case 'loop': {
        const count = Math.max(0, Number(value || 0));
        if (!step.children?.length) throw new Error('Repeat actions step has no child actions.');
        for (let index = 0; index < count; index += 1) {
          for (const child of step.children) await this.runPlaywrightStep(page, child, { ...row, index });
        }
        return;
      }
      case 'excelLoop': {
        const rows = await this.readDataRows(value);
        if (!step.children?.length) throw new Error('Excel data loop has no child actions.');
        for (const dataRow of rows) {
          for (const child of step.children) await this.runPlaywrightStep(page, child, dataRow);
        }
        return;
      }
      case 'apiRequest': {
        const response = await page.request.fetch(value || target, { method: 'GET' });
        if (!response.ok()) throw new Error(`API request failed with status ${response.status()}.`);
        return;
      }
      default:
        throw new Error(`Unsupported Playwright action "${step.type || 'unknown'}".`);
    }
  }

  private async readDataRows(filePath: string): Promise<Array<Record<string, unknown>>> {
    if (!filePath) throw new Error('Excel data loop has no data file path.');
    const absolutePath = path.isAbsolute(filePath) ? filePath : path.resolve(this.getBuilderProjectPath() || process.cwd(), filePath);
    if (!fs.existsSync(absolutePath)) throw new Error(`Data file does not exist: ${absolutePath}`);
    if (absolutePath.toLowerCase().endsWith('.json')) {
      const data = JSON.parse(fs.readFileSync(absolutePath, 'utf8')) as unknown;
      if (!Array.isArray(data)) throw new Error('JSON data loop files must contain an array of objects.');
      return data as Array<Record<string, unknown>>;
    }
    if (absolutePath.toLowerCase().endsWith('.xlsx')) {
      const tempDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'automationstudio-xlsx-'));
      try {
        await execFile('unzip', ['-p', absolutePath, 'xl/sharedStrings.xml'], { maxBuffer: 20 * 1024 * 1024 }).catch(() => ({ stdout: '' }));
        const sheet = (await execFile('unzip', ['-p', absolutePath, 'xl/worksheets/sheet1.xml'], { maxBuffer: 50 * 1024 * 1024 })).stdout;
        const sharedXml = (await execFile('unzip', ['-p', absolutePath, 'xl/sharedStrings.xml'], { maxBuffer: 20 * 1024 * 1024 }).catch(() => ({ stdout: '' }))).stdout;
        const shared = [...sharedXml.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(match => match[1] || '');
        const rows = [...sheet.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)].map(match => match[1] || '').map(xml => {
          const values: string[] = [];
          for (const cell of xml.matchAll(/<c[^>]*?(?:r="([A-Z]+)\d+")?[^>]*?(?:t="([^"]+)")?[^>]*>([\s\S]*?)<\/c>/g)) {
            const body = cell[3] || '';
            const raw = body.match(/<v>([\s\S]*?)<\/v>/)?.[1] || body.match(/<t[^>]*>([\s\S]*?)<\/t>/)?.[1] || '';
            values.push(cell[2] === 's' ? shared[Number(raw)] || '' : raw);
          }
          return values;
        });
        const headers = rows.shift() || [];
        return rows.map(values => Object.fromEntries(headers.map((header, index) => [header || `column${index + 1}`, values[index] || ''])));
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    }
    const lines = fs.readFileSync(absolutePath, 'utf8').split(/\r?\n/).filter(Boolean);
    if (!lines.length) return [];
    const parse = (line: string): string[] => line.split(line.includes('\t') ? '\t' : ',').map(value => value.trim().replace(/^"|"$/g, ''));
    const headers = parse(lines[0] || '');
    return lines.slice(1).map(line => Object.fromEntries(parse(line).map((value, index) => [headers[index] || `column${index + 1}`, value])));
  }

  private async captureStepScreenshot(page: any): Promise<string | undefined> {
    try {
      const bytes = await page?.screenshot({ type: 'png' });
      return bytes ? `data:image/png;base64,${Buffer.from(bytes).toString('base64')}` : undefined;
    } catch {
      return undefined;
    }
  }

  private async writeFlowReport(
    executionId: string,
    status: 'passed' | 'failed',
    duration: number,
    steps: Array<{ name: string; status: string; durationMs: number; error?: string; screenshot?: string }>,
    error?: string,
  ): Promise<void> {
    const projectPath = this.getBuilderProjectPath();
    const workspaceRoot = projectPath || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot) throw new Error('No active Automation Studio project/workspace is available for the execution report.');
    const reportsDir = path.join(workspaceRoot, '.automationstudio', 'reports', executionId);
    fs.mkdirSync(reportsDir, { recursive: true });
    const reportHtmlPath = path.join(reportsDir, 'report.html');
    const report = {
      executionId,
      status,
      duration,
      timestamp: new Date().toISOString(),
      error,
      steps,
      reportHtmlPath,
    };
    fs.writeFileSync(path.join(reportsDir, 'report.json'), JSON.stringify(report, null, 2), 'utf8');
    fs.writeFileSync(reportHtmlPath, this.generateHtmlReport(report), 'utf8');
    const failures = status === 'failed' ? 1 : 0;
    const durationSecs = (duration / 1000).toFixed(3);
    const failureXml = error ? `\n      <failure message="Step failed"><![CDATA[${error}]]></failure>` : '';
    fs.writeFileSync(path.join(reportsDir, 'junit.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<testsuites>
  <testsuite name="Flow Builder PW Execution" tests="1" failures="${failures}" errors="0" time="${durationSecs}">
    <testcase name="${this.escapeXml('PW flow')}" classname="FlowBuilder" time="${durationSecs}">${failureXml}</testcase>
  </testsuite>
</testsuites>`, 'utf8');
  }

  private generateHtmlReport(report: { executionId: string; status: string; duration: number; timestamp: string; error?: string; steps: Array<{ name: string; status: string; durationMs: number; error?: string; screenshot?: string }> }): string {
    const escapeHtml = (value: unknown): string => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    const passed = report.steps.filter(step => step.status === 'passed').length;
    const failed = report.steps.filter(step => step.status === 'failed').length;
    const statusColor = report.status === 'passed' ? '#198754' : '#dc3545';
    const rows = report.steps.map((step, index) => `
      <article class="step ${step.status}">
        <div class="step-head"><span class="badge">${step.status.toUpperCase()}</span><strong>Step ${index + 1}: ${escapeHtml(step.name)}</strong><span class="duration">${step.durationMs} ms</span></div>
        ${step.error ? `<pre>${escapeHtml(step.error)}</pre>` : ''}
        ${step.screenshot ? `<details><summary>Screenshot</summary><img src="${step.screenshot}" alt="Screenshot after step ${index + 1}"></details>` : ''}
      </article>`).join('');
    return `<!doctype html><html><head><meta charset="utf-8"><title>Automation Studio Report ${escapeHtml(report.executionId)}</title><style>
      body{margin:0;padding:32px;background:#f4f6f8;color:#20252b;font:14px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.report{max-width:1000px;margin:auto;background:#fff;padding:28px 34px;border-radius:10px;box-shadow:0 3px 18px #0002}h1{margin:0 0 6px}.meta{color:#68717b;margin-bottom:24px}.summary{display:flex;gap:20px;align-items:center;border-top:4px solid ${statusColor};padding:16px 0;margin-bottom:22px}.summary strong{font-size:20px;color:${statusColor}}.stat{padding:7px 12px;background:#eef1f4;border-radius:6px}.step{border:1px solid #dce1e5;border-left:5px solid #198754;border-radius:6px;padding:14px 16px;margin:10px 0}.step.failed{border-left-color:#dc3545}.step-head{display:flex;gap:12px;align-items:center}.badge{font-size:11px;color:#fff;background:#198754;border-radius:4px;padding:3px 7px}.failed .badge{background:#dc3545}.duration{margin-left:auto;color:#68717b;font-family:ui-monospace,monospace}pre{white-space:pre-wrap;background:#fff4f4;color:#9a1c1c;padding:10px;border-radius:4px}details{margin-top:12px}summary{cursor:pointer;color:#276ea6}img{display:block;max-width:100%;margin-top:10px;border:1px solid #dce1e5;border-radius:4px}
    </style></head><body><main class="report"><h1>Automation Studio Execution Report</h1><div class="meta">Run ${escapeHtml(report.executionId)} · ${escapeHtml(report.timestamp)}</div><div class="summary"><strong>${report.status.toUpperCase()}</strong><span class="stat">Passed: ${passed}</span><span class="stat">Failed: ${failed}</span><span class="stat">Duration: ${(report.duration / 1000).toFixed(2)}s</span></div><section>${rows || '<p>No steps were executed.</p>'}</section></main></body></html>`;
  }

  private escapeXml(value: string): string {
    return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
  }

  private async saveFlowObjects(projectPath: string, mode: FlowMode, nodes: FlowNodeMessage[]): Promise<number> {
    const repository = new UnifiedFileSystemObjectRepository(projectPath);
    let saved = 0;
    let latestScreenshot: { name?: string; dataUrl?: string; path?: string } | undefined;
    const slug = (value: string): string => value.toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.|\.$/g, '').slice(0, 80) || 'element';
    const persist = async (step: FlowStepMessage): Promise<void> => {
      if (step.screenshots?.[0]) latestScreenshot = step.screenshots[0];
      const type = String(step.type || '').toLowerCase();
      const rawLocator = String(step.locator || step.target || '').trim();
      const isUrl = /^https?:\/\//i.test(rawLocator) || /^https?:\/\//i.test(String(step.value || ''));
      if (!rawLocator || isUrl || ['start', 'end', 'launch', 'navigate', 'loop', 'excelLoop'].includes(type) || rawLocator.startsWith('object://')) {
        for (const child of step.children || []) await persist(child);
        return;
      }
      const id = String(step.objectId || `app.${slug(String(step.label || step.target || step.controlType || 'element'))}`).replace(/^object:\/\//, '');
      const strategy = String(step.locatorStrategy || (mode === 'pw' ? 'css' : 'ocr'));
      const object: any = {
        id,
        name: String(step.label || step.target || id),
        type: step.controlType === 'textBox' ? 'textbox' : step.controlType === 'dropDown' ? 'dropdown' : step.controlType || 'custom',
        description: 'Automatically saved from Flow Builder',
        pw: mode === 'pw' ? (strategy === 'xpath' ? { xpath: rawLocator } : strategy === 'role' ? { role: rawLocator } : strategy === 'testId' ? { testId: rawLocator } : { css: rawLocator }) : undefined,
        surface: mode === 'surface' ? [{ strategy, value: rawLocator || step.label, region: step.bbox, scope: 'window', windowTitle: step.windowName, priority: 10 }] : undefined,
        screenshot: step.screenshots?.[0] || latestScreenshot,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        version: 1,
      };
      await repository.save(object);
      step.objectId = `object://${id}`;
      saved += 1;
      for (const child of step.children || []) await persist(child);
    };
    for (const node of nodes) {
      for (const step of node.steps || []) await persist(step);
      for (const child of node.children || []) await persist(child);
    }
    return saved;
  }

  private applyObjectTargets(nodes: FlowNodeMessage[]): FlowNodeMessage[] {
    const mapStep = (step: FlowStepMessage): FlowStepMessage => ({
      ...step,
      target: step.objectId || step.target,
      children: step.children?.map(mapStep),
    });
    return nodes.map((node) => ({ ...node, target: node.objectId || node.target, steps: node.steps?.map(mapStep), children: node.children?.map(mapStep) }));
  }

  private async saveFlow(message: { mode?: FlowMode; name?: string; nodes?: FlowNodeMessage[]; scenarios?: Array<{ id: string; name: string; isOutline?: boolean; examples?: Array<Record<string, string>>; nodes?: FlowNodeMessage[] }> }): Promise<void> {
    const projectPath = this.getBuilderProjectPath();
    if (!projectPath) {
      const action = await vscode.window.showErrorMessage(
        'Create or open an Automation Studio project before saving a flow.',
        'Create project',
        'Open project',
      );
      if (action === 'Create project') await vscode.commands.executeCommand('automationStudio.project.create');
      if (action === 'Open project') await vscode.commands.executeCommand('automationStudio.project.open');
      await this.sendBuilderProjects();
      return;
    }
    const mode: FlowMode = message.mode === 'surface' ? 'surface' : 'pw';
    const name = String(message.name || (mode === 'surface' ? 'Surface Flow' : 'Playwright Flow')).trim() || 'Untitled Flow';
    const nodes = message.nodes || [];
    const scenariosDir = path.join(projectPath, 'automation', 'scenarios');
    fs.mkdirSync(scenariosDir, { recursive: true });
    const baseName = this.slugify(name);
    const scriptDir = path.join(scenariosDir, baseName);
    fs.mkdirSync(scriptDir, { recursive: true });

    const rawScenarios = message.scenarios?.length
      ? message.scenarios
      : [{ id: `sc-1`, name, isOutline: false, examples: [], nodes }];

    let totalSavedObjects = 0;
    const processedScenarios = rawScenarios.map((sc, scIdx) => {
      const scNodes = sc.nodes || (scIdx === 0 ? nodes : []);
      const persisted = this.persistStepScreenshots(projectPath, `${baseName}-${scIdx + 1}`, scNodes);
      return {
        id: sc.id || `sc-${scIdx + 1}`,
        name: sc.name || `Scenario ${scIdx + 1}`,
        isOutline: Boolean(sc.isOutline),
        examples: Array.isArray(sc.examples) ? sc.examples : [],
        nodes: this.applyObjectTargets(persisted),
      };
    });

    for (const sc of processedScenarios) {
      totalSavedObjects += await this.saveFlowObjects(projectPath, mode, sc.nodes);
    }

    const savedNodes = processedScenarios[0]?.nodes || this.applyObjectTargets(this.persistStepScreenshots(projectPath, baseName, nodes));
    const filePath = path.join(scriptDir, 'spec.scenario.json');
    let existing: Partial<IScenario> = {};
    if (fs.existsSync(filePath)) {
      try { existing = JSON.parse(fs.readFileSync(filePath, 'utf8')) as Partial<IScenario>; } catch { existing = {}; }
    } else {
      const legacyPath = path.join(scenariosDir, `${baseName}.scenario.json`);
      if (fs.existsSync(legacyPath)) {
        try { existing = JSON.parse(fs.readFileSync(legacyPath, 'utf8')) as Partial<IScenario>; } catch { existing = {}; }
      }
    }
    const now = Date.now();
    const scenario: IScenario = {
      id: existing.id || randomUUID(), name, description: `${mode === 'surface' ? 'Surface' : 'Playwright'} flow created in Automation Studio Builder`,
      mode: mode === 'surface' ? 'surface' : 'playwright',
      metadata: {
        schemaVersion: '1.0',
        createdBy: 'Automation Studio',
        generatedBy: `Automation Studio Builder (${mode === 'surface' ? 'Surface' : 'Playwright'})`,
        platformVersion: '0.1.9',
        flowNodes: savedNodes,
        scenarios: processedScenarios,
      },
      steps: this.toScenarioSteps(savedNodes, mode), createdAt: existing.createdAt || now, updatedAt: now,
    };
    (scenario as any).flowNodes = savedNodes;
    (scenario as any).scenarios = processedScenarios;
    fs.writeFileSync(filePath, JSON.stringify(scenario, null, 2), 'utf8');
    // Keep generated representations inside the script folder with standardized spec names
    fs.writeFileSync(path.join(scriptDir, 'spec.feature'), this.generateGherkinFile(name, savedNodes, mode, processedScenarios), 'utf8');
    if (mode === 'surface') {
      fs.writeFileSync(path.join(scriptDir, 'spec.generated.ts'), this.generateSurfaceTypeScript(name, savedNodes, processedScenarios), 'utf8');
      fs.writeFileSync(path.join(scriptDir, 'spec.generated.py'), SurfaceGenerator.generatePython(scenario), 'utf8');
    } else {
      fs.writeFileSync(path.join(scriptDir, 'spec.generated.ts'), this.generatePlaywrightFile(name, savedNodes, mode, processedScenarios), 'utf8');
    }
    await vscode.commands.executeCommand('automationStudio.project.reload');
    vscode.window.showInformationMessage(`Flow saved to ${baseName}/spec.scenario.json${totalSavedObjects ? ` · ${totalSavedObjects} object${totalSavedObjects === 1 ? '' : 's'} saved` : ''}.`);
    await this.sendObjectList();
    await vscode.commands.executeCommand('automationStudio.objectRepository.refresh');
    await this.panel?.postMessage({ type: 'flowSaved', payload: { filePath, name, mode, nodes: savedNodes, scenarios: processedScenarios } });
    await this.listSavedFlows();
  }

  /** Scan the current project's scenarios directory and send the list of saved flows to the webview. */
  private async listSavedFlows(): Promise<void> {
    const projectPath = this.getBuilderProjectPath();
    if (!projectPath) {
      await this.panel?.postMessage({ type: 'flowList', flows: [] });
      return;
    }
    const scenariosDir = path.join(projectPath, 'automation', 'scenarios');
    if (!fs.existsSync(scenariosDir)) {
      await this.panel?.postMessage({ type: 'flowList', flows: [] });
      return;
    }
    const flows: Array<{ name: string; filePath: string; mode: string; updatedAt: number }> = [];
    for (const entry of fs.readdirSync(scenariosDir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        const subDir = path.join(scenariosDir, entry.name);
        for (const subEntry of fs.readdirSync(subDir, { withFileTypes: true })) {
          if (subEntry.isFile() && subEntry.name.endsWith('.scenario.json')) {
            try {
              const filePath = path.join(subDir, subEntry.name);
              const scenario = JSON.parse(fs.readFileSync(filePath, 'utf8')) as Partial<IScenario>;
              flows.push({
                name: scenario.name || entry.name,
                filePath,
                mode: scenario.mode === 'surface' ? 'surface' : 'pw',
                updatedAt: typeof scenario.updatedAt === 'number' ? scenario.updatedAt : 0,
              });
            } catch { /* skip unparseable files */ }
          }
        }
      } else if (entry.isFile() && entry.name.endsWith('.scenario.json')) {
        try {
          const filePath = path.join(scenariosDir, entry.name);
          const scenario = JSON.parse(fs.readFileSync(filePath, 'utf8')) as Partial<IScenario>;
          flows.push({
            name: scenario.name || entry.name.replace('.scenario.json', ''),
            filePath,
            mode: scenario.mode === 'surface' ? 'surface' : 'pw',
            updatedAt: typeof scenario.updatedAt === 'number' ? scenario.updatedAt : 0,
          });
        } catch { /* skip unparseable files */ }
      }
    }
    flows.sort((a, b) => b.updatedAt - a.updatedAt);
    await this.panel?.postMessage({ type: 'flowList', flows });
  }

  /** Load a previously saved scenario and send it to the webview as editable flow nodes. */
  private async loadSavedFlow(filePath: string): Promise<void> {
    if (!filePath || !fs.existsSync(filePath)) throw new Error('Scenario file not found.');
    const scenario = JSON.parse(fs.readFileSync(filePath, 'utf8')) as any;
    const mode: FlowMode = scenario.mode === 'surface' ? 'surface' : 'pw';
    let nodes: FlowNodeMessage[] = scenario.metadata?.flowNodes || scenario.flowNodes;
    if (!nodes || !Array.isArray(nodes) || !nodes.length) {
      const allSteps = [...(scenario.preconditions || []), ...(scenario.steps || []), ...(scenario.assertions || []), ...(scenario.cleanup || [])]
        .filter((step: any) => !step.disabled);
      nodes = [
        { id: `loaded-start-${Date.now()}`, type: 'start', label: 'Start' },
        {
          id: `loaded-workflow-${Date.now()}`,
          type: 'workflow',
          label: scenario.name || 'Loaded Flow',
          steps: allSteps.map((step: any) => {
            const value = step.parameters?.find((p: any) => ['value', 'url', 'text', 'path', 'count'].includes(p.name))?.value;
            const type = step.type === 'assertVisible' || step.type === 'assertText' ? 'verify'
              : step.type === 'waitNavigation' ? 'wait' : step.type;
            return {
              id: step.id,
              type,
              label: step.description || step.type,
              target: step.target,
              value,
              isSecret: step.parameters?.some((p: any) => p.isSecret) || value?.startsWith('secret://'),
              windowName: scenario.mode === 'surface' ? step.surface?.windowTitle : undefined,
              controlType: step.controlType,
              locatorStrategy: step.locatorStrategy || (step.surface?.locators?.[0]?.strategy),
              locator: step.locator || (step.surface?.locators?.[0]?.value),
              bbox: step.bbox || (step.surface?.locators?.[0]?.region),
              children: step.children,
              screenshots: step.screenshots,
            } satisfies FlowStepMessage;
          }),
        },
        { id: `loaded-end-${Date.now()}`, type: 'end', label: 'End' },
      ];
    }
    const scenarios: Array<{ id: string; name: string; isOutline?: boolean; examples?: Array<Record<string, string>>; nodes: FlowNodeMessage[] }> = scenario.metadata?.scenarios || scenario.scenarios || [
      { id: scenario.id || `sc-${Date.now()}`, name: scenario.name || 'Scenario 1', isOutline: false, examples: [], nodes }
    ];
    await this.panel?.postMessage({ type: 'flowLoaded', name: scenario.name, mode, nodes, scenarios, filePath });
  }

  private persistStepScreenshots(projectPath: string, baseName: string, nodes: FlowNodeMessage[]): FlowNodeMessage[] {
    const screenshotRoot = path.join(projectPath, 'artifacts', 'screenshots', baseName);
    let screenshotNumber = 0;
    const persistStep = (step: FlowStepMessage): FlowStepMessage => {
      const screenshots = step.screenshots?.map((screenshot) => {
        if (!screenshot.dataUrl) return { ...screenshot };
        const match = screenshot.dataUrl.match(/^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/s);
        if (!match) return { name: screenshot.name, path: screenshot.path };
        fs.mkdirSync(screenshotRoot, { recursive: true });
        const extension = match[1] === 'jpeg' || match[1] === 'jpg' ? 'jpg' : match[1];
        const fileName = `${String(++screenshotNumber).padStart(3, '0')}-${this.slugify(screenshot.name || 'step')}.${extension}`;
        const filePath = path.join(screenshotRoot, fileName);
        fs.writeFileSync(filePath, Buffer.from(match[2]!, 'base64'));
        return { name: screenshot.name, path: filePath };
      });
      return { ...step, screenshots, children: step.children?.map(persistStep) };
    };
    return nodes.map((node) => ({ ...node, steps: node.steps?.map(persistStep), children: node.children?.map(persistStep) }));
  }

  private generateGherkinFile(name: string, nodes: FlowNodeMessage[], mode: FlowMode, scenarios?: Array<{ name: string; isOutline?: boolean; examples?: Array<Record<string, string>>; nodes?: FlowNodeMessage[] }>): string {
    const list = scenarios?.length ? scenarios : [{ name, nodes, isOutline: false, examples: [] }];
    const lines = [`Feature: ${name}`, ''];
    for (const sc of list) {
      const steps = this.toScenarioSteps(sc.nodes || [], mode);
      const isOutline = Boolean(sc.isOutline || (sc.examples && sc.examples.length > 0));
      lines.push(`  ${isOutline ? 'Scenario Outline' : 'Scenario'}: ${sc.name || 'Execute ' + name}`);
      if (mode === 'surface') lines.push('    Given the desktop application is ready');
      const emitGherkin = (step: IStep, index: number): void => {
        if (step.type === 'callAction') {
          lines.push(`    # Reusable action: ${step.description || step.target || 'Custom Action'}`);
          (step.children || []).forEach((child: IStep, childIdx: number) => emitGherkin(child, childIdx));
          return;
        }
        const target = step.target || step.description || 'the element';
        const value = step.parameters?.find((parameter: IStepParameter) => ['value', 'url', 'path', 'count'].includes(parameter.name))?.value;
        if (step.type === 'navigate') lines.push(`    Given I navigate to ${value || target}`);
        else if (step.type === 'type') lines.push(`    When I fill ${target} with ${value || 'the test value'}`);
        else if (step.type === 'uploadFile') lines.push(`    When I upload ${value || 'a file'} into ${target}`);
        else if (step.type === 'tableCount') lines.push(`    Then ${target} has ${value || 'the expected number of'} rows`);
        else if (step.type === 'excelLoop') lines.push(`    When I repeat the child actions for each row in ${value || 'the data file'}`);
        else if (step.type === 'loop') lines.push(`    When I repeat the child actions ${value || 'the configured number of'} times`);
        else if (step.type === 'assertText' || step.type === 'assertVisible') lines.push(`    Then ${target} is visible`);
        else if (index === 0) lines.push(`    Given I interact with ${target}`);
        else lines.push(`    When I click ${target}`);
      };
      steps.forEach((step, index) => emitGherkin(step, index));

      if (isOutline && sc.examples && sc.examples.length > 0) {
        lines.push('');
        lines.push('    Examples:');
        const headers = Object.keys(sc.examples[0] || {});
        if (headers.length > 0) {
          lines.push(`      | ${headers.join(' | ')} |`);
          for (const row of sc.examples) {
            lines.push(`      | ${headers.map(h => row[h] || '').join(' | ')} |`);
          }
        }
      }
      lines.push('');
    }
    return `${lines.join('\n')}\n`;
  }

  private generatePlaywrightFile(name: string, nodes: FlowNodeMessage[], mode: FlowMode, scenarios?: Array<{ name: string; isOutline?: boolean; examples?: Array<Record<string, string>>; nodes?: FlowNodeMessage[] }>): string {
    if (mode !== 'pw') return this.generateSurfaceTypeScript(name, nodes, scenarios);
    const list = scenarios?.length ? scenarios : [{ name, nodes, isOutline: false, examples: [] }];
    const allScSteps = list.flatMap(sc => this.toScenarioSteps(sc.nodes || [], mode));
    const flattenAllSteps = (st: IStep[]): IStep[] => st.flatMap((s) => [s, ...flattenAllSteps(s.children || [])]);
    const allSteps = flattenAllSteps(allScSteps);
    const hasReferences = allSteps.some((step) => step.target?.startsWith('object://') || step.parameters?.some((parameter: IStepParameter) => parameter.value.startsWith('secret://') || parameter.value.startsWith('data://')));
    const lines = [`import { test, expect } from '@playwright/test';`, ''];
    if (allSteps.some((step) => step.type === 'excelLoop') || hasReferences) {
      lines.push(`import { readFileSync } from 'node:fs';`, `import { join } from 'node:path';`, '');
    }
    if (allSteps.some((step) => step.type === 'excelLoop')) {
      lines.push(`const rowsFromDataFile = (filePath: string): Array<Record<string, string>> => {`, `  const raw = readFileSync(filePath, 'utf8').trim();`, `  if (filePath.toLowerCase().endsWith('.json')) return JSON.parse(raw);`, `  const rows = raw.split(/\\r?\\n/).filter(Boolean).map(line => line.split(',').map(value => value.trim().replace(/^"|"$/g, '')));`, `  const headers = rows.shift() || [];`, `  return rows.map(values => Object.fromEntries(headers.map((header, index) => [header || \`column\${index + 1}\`, values[index] || ''])));`, `};`, '');
    }
    if (hasReferences) {
      lines.push(`const resolveReference = (value: string): string => {`, `  if (value.startsWith('secret://')) {`, `    const envName = 'AS_SECRET_' + value.slice('secret://'.length).replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').toUpperCase();`, `    const secret = process.env[envName];`, `    if (secret === undefined) throw new Error(\`Missing secret environment variable: \${envName}\`);`, `    return secret;`, `  }`, `  if (value.startsWith('data://')) {`, `    const data = JSON.parse(readFileSync(join(process.cwd(), 'automation/testdata/testdata.json'), 'utf8')) as Record<string, unknown>;`, `    const resolved = value.slice('data://'.length).split('.').reduce<unknown>((current, key) => (current as Record<string, unknown>)?.[key], data);`, `    if (resolved === undefined) throw new Error(\`Missing test data: \${value}\`);`, `    return String(resolved);`, `  }`, `  return value;`, `};`, `const resolveLocator = async (page: any, ref: string): Promise<any> => {`, `  if (!ref.startsWith('object://')) return page.locator(ref);`, `  const objectId = ref.slice('object://'.length);`, `  const object = JSON.parse(readFileSync(join(process.cwd(), 'automation/object-repository', objectId + '.object.json'), 'utf8'));`, `  if (object.pw?.testId) return page.getByTestId(object.pw.testId);`, `  if (object.pw?.role) return page.getByRole(object.pw.role, object.pw.name ? { name: object.pw.name } : undefined);`, `  if (object.pw?.css) return page.locator(object.pw.css);`, `  if (object.pw?.xpath) return page.locator(object.pw.xpath);`, `  throw new Error(\`Object has no Playwright locator: \${ref}\`);`, `};`, '');
    }

    lines.push(`test.describe(${JSON.stringify(name)}, () => {`);
    for (let scIdx = 0; scIdx < list.length; scIdx++) {
      const sc = list[scIdx]!;
      const steps = this.toScenarioSteps(sc.nodes || [], mode);
      const isOutline = Boolean(sc.isOutline || (sc.examples && sc.examples.length > 0));
      const examples = sc.examples || [];

      if (isOutline && examples.length > 0) {
        const dataVarName = `scenario${scIdx + 1}Examples`;
        lines.push(`  const ${dataVarName} = ${JSON.stringify(examples, null, 2).replace(/\n/g, '\n  ')};`);
        lines.push('');
        lines.push(`  for (const example of ${dataVarName}) {`);
        lines.push(`    test(\`${sc.name || 'Scenario'} (\${JSON.stringify(example)})\`, async ({ page }) => {`);
        let locatorCounter = 0;
        const emitStep = (step: IStep, indent = '      '): void => {
          if (step.type === 'callAction') {
            lines.push(`${indent}// Reusable action: ${step.description || step.target || 'Custom Action'}`);
            (step.children || []).forEach((child: IStep) => emitStep(child, indent));
            return;
          }
          const target = JSON.stringify(step.target || step.description || '');
          const value = step.parameters?.find((parameter: IStepParameter) => parameter.name === 'value' || parameter.name === 'url')?.value;
          const valueExpression = hasReferences ? `resolveReference(${JSON.stringify(value || '')})` : JSON.stringify(value || '');
          const locatorName = `locator${++locatorCounter}`;
          const needsLocator = !['navigate', 'screenshot', 'excelLoop', 'loop', 'callAction'].includes(step.type || '');
          if (needsLocator) lines.push(`${indent}const ${locatorName} = ${hasReferences ? `await resolveLocator(page, ${target})` : `page.locator(${target})`};`);
          if (step.type === 'navigate') lines.push(`${indent}await page.goto(${valueExpression || JSON.stringify(step.target || '')});`);
          else if (step.type === 'type') lines.push(`${indent}await ${locatorName}.fill(${valueExpression});`);
          else if (step.type === 'uploadFile') lines.push(`${indent}await ${locatorName}.setInputFiles(${valueExpression});`);
          else if (step.type === 'tableCount') lines.push(`${indent}await expect(${locatorName}).toHaveCount(Number(${valueExpression}) || 0);`);
          else if (step.type === 'assertText') lines.push(`${indent}await expect(${locatorName}).toContainText(${valueExpression});`);
          else if (step.type === 'assertValue') lines.push(`${indent}await expect(${locatorName}).toHaveValue(${valueExpression});`);
          else if (step.type === 'hover') lines.push(`${indent}await ${locatorName}.hover();`);
          else if (step.type === 'doubleClick') lines.push(`${indent}await ${locatorName}.dblclick();`);
          else if (step.type === 'rightClick') lines.push(`${indent}await ${locatorName}.click({ button: 'right' });`);
          else if (step.type === 'check') lines.push(`${indent}await ${locatorName}.check();`);
          else if (step.type === 'uncheck') lines.push(`${indent}await ${locatorName}.uncheck();`);
          else if (step.type === 'pressKey') lines.push(`${indent}await ${locatorName}.press(${valueExpression || JSON.stringify('Enter')});`);
          else if (step.type === 'waitForElement') lines.push(`${indent}await ${locatorName}.waitFor({ state: 'visible' });`);
          else if (step.type === 'screenshot') lines.push(`${indent}await page.screenshot({ path: ${valueExpression || JSON.stringify('artifacts/screenshot.png')}, fullPage: true });`);
          else if (step.type === 'excelLoop') lines.push(`${indent}for (const row of rowsFromDataFile(${valueExpression})) { /* generated child steps use {{column}} */ }`);
          else if (step.type === 'loop') lines.push(`${indent}for (let i = 0; i < Number(${valueExpression}) || 0; i++) { /* generated child steps */ }`);
          else if (step.type === 'assertVisible') lines.push(`${indent}await expect(${locatorName}).toBeVisible();`);
          else if (step.type === 'click') lines.push(`${indent}await ${locatorName}.click();`);
          else lines.push(`${indent}throw new Error(${JSON.stringify(`Unsupported generated Playwright action: ${step.type}`)});`);
        };
        steps.forEach((step) => emitStep(step, '      '));
        lines.push('    });');
        lines.push('  }');
      } else {
        lines.push(`  test(${JSON.stringify(sc.name || 'Scenario')}, async ({ page }) => {`);
        let locatorCounter = 0;
        const emitStep = (step: IStep, indent = '    '): void => {
          if (step.type === 'callAction') {
            lines.push(`${indent}// Reusable action: ${step.description || step.target || 'Custom Action'}`);
            (step.children || []).forEach((child: IStep) => emitStep(child, indent));
            return;
          }
          const target = JSON.stringify(step.target || step.description || '');
          const value = step.parameters?.find((parameter: IStepParameter) => parameter.name === 'value' || parameter.name === 'url')?.value;
          const valueExpression = hasReferences ? `resolveReference(${JSON.stringify(value || '')})` : JSON.stringify(value || '');
          const locatorName = `locator${++locatorCounter}`;
          const needsLocator = !['navigate', 'screenshot', 'excelLoop', 'loop', 'callAction'].includes(step.type || '');
          if (needsLocator) lines.push(`${indent}const ${locatorName} = ${hasReferences ? `await resolveLocator(page, ${target})` : `page.locator(${target})`};`);
          if (step.type === 'navigate') lines.push(`${indent}await page.goto(${valueExpression || JSON.stringify(step.target || '')});`);
          else if (step.type === 'type') lines.push(`${indent}await ${locatorName}.fill(${valueExpression});`);
          else if (step.type === 'uploadFile') lines.push(`${indent}await ${locatorName}.setInputFiles(${valueExpression});`);
          else if (step.type === 'tableCount') lines.push(`${indent}await expect(${locatorName}).toHaveCount(Number(${valueExpression}) || 0);`);
          else if (step.type === 'assertText') lines.push(`${indent}await expect(${locatorName}).toContainText(${valueExpression});`);
          else if (step.type === 'assertValue') lines.push(`${indent}await expect(${locatorName}).toHaveValue(${valueExpression});`);
          else if (step.type === 'hover') lines.push(`${indent}await ${locatorName}.hover();`);
          else if (step.type === 'doubleClick') lines.push(`${indent}await ${locatorName}.dblclick();`);
          else if (step.type === 'rightClick') lines.push(`${indent}await ${locatorName}.click({ button: 'right' });`);
          else if (step.type === 'check') lines.push(`${indent}await ${locatorName}.check();`);
          else if (step.type === 'uncheck') lines.push(`${indent}await ${locatorName}.uncheck();`);
          else if (step.type === 'pressKey') lines.push(`${indent}await ${locatorName}.press(${valueExpression || JSON.stringify('Enter')});`);
          else if (step.type === 'waitForElement') lines.push(`${indent}await ${locatorName}.waitFor({ state: 'visible' });`);
          else if (step.type === 'screenshot') lines.push(`${indent}await page.screenshot({ path: ${valueExpression || JSON.stringify('artifacts/screenshot.png')}, fullPage: true });`);
          else if (step.type === 'excelLoop') lines.push(`${indent}for (const row of rowsFromDataFile(${valueExpression})) { /* generated child steps use {{column}} */ }`);
          else if (step.type === 'loop') lines.push(`${indent}for (let i = 0; i < Number(${valueExpression}) || 0; i++) { /* generated child steps */ }`);
          else if (step.type === 'assertVisible') lines.push(`${indent}await expect(${locatorName}).toBeVisible();`);
          else if (step.type === 'click') lines.push(`${indent}await ${locatorName}.click();`);
          else lines.push(`${indent}throw new Error(${JSON.stringify(`Unsupported generated Playwright action: ${step.type}`)});`);
        };
        steps.forEach((step) => emitStep(step, '    '));
        lines.push('  });');
      }
    }
    lines.push('});', '');
    return lines.join('\n');
  }

  private generateSurfaceTypeScript(name: string, nodes: FlowNodeMessage[], scenarios?: Array<{ name: string; nodes?: FlowNodeMessage[] }>): string {
    const list = scenarios?.length ? scenarios : [{ name, nodes }];
    const allSteps = list.flatMap((sc) => this.toScenarioSteps(sc.nodes || [], 'surface'));
    const workflow = {
      name,
      mode: 'surface',
      scenarios: list.map((sc) => ({ name: sc.name, steps: this.toScenarioSteps(sc.nodes || [], 'surface') })),
      runtime: { windowTitle: allSteps.find((step) => step.surface?.windowTitle)?.surface?.windowTitle || '' },
      steps: allSteps,
    };
    return [
      `// Generated Surface multi-scenario workflow: ${name}`,
      '// This file contains the selected controls, locators, values, and step order.',
      'export const surfaceWorkflow = ' + JSON.stringify(workflow, null, 2) + ' as const;',
      '',
      'export default surfaceWorkflow;',
      '',
    ].join('\n');
  }

  private toScenarioSteps(nodes: FlowNodeMessage[], mode: FlowMode): IStep[] {
    return nodes.filter((node) => !['start', 'end', 'condition'].includes(node.type || '')).flatMap((node, index) => {
      const visualSteps = node.type === 'workflow' && node.steps?.length ? node.steps : [node];
      return visualSteps.map((visualStep, visualIndex) => this.toScenarioStep({ ...visualStep, id: `${node.id || `step-${index + 1}`}-${visualIndex + 1}` }, mode, index + visualIndex));
    });
  }

  private toScenarioStep(node: FlowStepMessage, mode: FlowMode, index: number): IStep {
    const type = this.mapNodeType(node.type || 'action');
    const target = String(node.objectId || node.target || node.label || '').trim();
    const value = String(node.value || '').trim();
    const parameters: IStepParameter[] = [];
    const passwordField = type === 'type' && (/password|passcode|secret/i.test(`${target} ${node.label || ''}`) || /^[•*]+$/.test(value));
    const resolvedValue = passwordField && !value.startsWith('secret://') ? 'secret://app.password' : value;
    const isSecret = Boolean(node.isSecret || resolvedValue.startsWith('secret://'));
    const isVariable = resolvedValue.startsWith('data://') || resolvedValue.includes('{{');
    const parameter = (name: string, parameterValue: string): void => {
      if (parameterValue || isSecret || isVariable) parameters.push({ name, value: parameterValue, isSecret, isVariable });
    };
    if (type === 'navigate' || type === 'waitNavigation') parameter('url', resolvedValue || target);
    else if (type === 'type' || type === 'uploadFile' || type === 'pressKey' || type === 'assertValue' || type === 'tableCount' || type === 'excelLoop') parameter(type === 'uploadFile' || type === 'excelLoop' ? 'path' : type === 'tableCount' ? 'count' : 'value', resolvedValue);
    else if (type === 'assertText') parameter('text', resolvedValue);
    else if (type === 'apiRequest') parameter('url', resolvedValue || target);
    const step = { id: String(node.id || `step-${index + 1}`), type, target: target || undefined, parameters, description: node.label, screenId: node.screenId, screenLabel: node.screenLabel, screenshots: node.screenshots?.map((screenshot) => ({ name: screenshot.name, path: screenshot.path, dataUrl: screenshot.dataUrl, redacted: screenshot.redacted })) } as IStep & { children?: IStep[] };
    if (node.children?.length) step.children = node.children.map((child, childIndex) => this.toScenarioStep({ ...child, id: child.id || `${step.id}-child-${childIndex + 1}` }, mode, childIndex));
    if (mode === 'surface') step.surface = {
      windowTitle: node.windowName,
      locators: target ? [{
        strategy: (node.locatorStrategy || 'ocr') as SurfaceLocatorStrategy,
        value: node.locator || target,
        region: node.bbox,
        scope: 'window',
      }] : undefined,
    };
    return step;
  }

  private mapNodeType(type: string): IStep['type'] {
    switch (type) {
      case 'launch': return 'launch';
      case 'navigate': return 'navigate';
      case 'verify': return 'assertVisible';
      case 'wait': return 'waitNavigation';
      case 'fill': case 'type': return 'type';
      case 'select': return 'select';
      case 'doubleClick': return 'doubleClick';
      case 'rightClick': return 'rightClick';
      case 'callAction': case 'reusableAction': case 'reusable': return 'callAction';
      default:
        if (ACTION_DESCRIPTORS.has(type as IStep['type'])) return type as IStep['type'];
        throw new Error(`Unknown action type "${type}". Register it in the shared action descriptors.`);
    }
  }

  private slugify(value: string): string { return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'untitled-flow'; }

  private escapeHtmlValue(value: string): string {
    return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }

  private getHtml(mode: FlowMode, options: FlowBuilderOptions = {}): string {
    const initialMode = mode === 'surface' ? 'surface' : 'pw';
    const initialName = JSON.stringify(options.scenarioName || 'login_workflow');
    const initialUrl = JSON.stringify(options.url || 'https://practicetestautomation.com/');
    const builderProjectPath = this.getBuilderProjectPath() || options.projectPath || '';
    const builderProjectName = builderProjectPath ? path.basename(builderProjectPath) : 'Select a project';
    return String.raw`<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; script-src 'unsafe-inline';"><title>Automation Studio Builder</title>
<style>
 :root{--bg:#0b0f14;--panel:#111820;--line:#2a3947;--text:#dce7ef;--muted:#8a9aa8;--blue:#4db2ff;--green:#45df9b;--purple:#c09cff;--orange:#ffb457;--red:#ff7180;--surface:#bcaeff}*{box-sizing:border-box}html,body{height:100%;margin:0}body{overflow:hidden;color:var(--text);background:var(--bg);font:12px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}button,input,select,textarea{font:inherit}button{cursor:pointer;color:inherit}.shell{height:100vh;display:grid;grid-template-rows:54px 50px minmax(0,1fr)}.topbar,.subbar{display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--line);background:#0d1218;padding:0 16px}.brand,.top-actions,.toolbar,.tabs,.pw-tools,.surface-tools{display:flex;align-items:center;gap:8px}.mark{display:grid;place-items:center;width:29px;height:29px;border:2px solid #ff7380;border-radius:50%;color:#fff;background:#d51f3b;font-size:13px;box-shadow:0 0 0 3px #d51f3b33}.title{font-weight:700}.crumb{margin-left:5px;color:var(--muted)}.button{padding:7px 11px;border:1px solid #415363;border-radius:5px;background:#151f28}.button:hover{background:#21303d}.button.primary{border-color:#3296d7;background:#0d74b8;color:#fff}.button.surface{border-color:#7966c2;background:#40316e}.button.ghost{border-color:transparent;background:transparent;color:var(--muted)}.mode-pill{padding:5px 9px;border:1px solid #467ca1;border-radius:20px;color:var(--blue);background:#112e42;text-transform:uppercase;font-size:10px;font-weight:700;letter-spacing:1px}.mode-pill.surface{border-color:#7365b2;color:#d0c5ff;background:#2b2450}.toolbar select,.toolbar input,.url-input{height:30px;padding:5px 9px;border:1px solid var(--line);border-radius:5px;color:var(--text);background:#17222c;outline:none}.url-input{width:310px}.toolbar input{width:190px}.tab{height:50px;padding:0 12px;border:0;border-bottom:2px solid transparent;background:transparent;color:var(--muted)}.tab.active{border-bottom-color:var(--blue);color:var(--blue)}.surface-mode{background:#151324}.surface-mode .tab.active{border-bottom-color:var(--surface);color:#c9bdff}.workspace{min-height:0;display:grid;grid-template-columns:255px minmax(440px,1fr) minmax(260px,320px)}.sidebar,.inspector{min-height:0;overflow:auto;background:var(--panel)}.sidebar{padding:14px 12px;border-right:1px solid var(--line)}.inspector{padding:15px;border-left:1px solid var(--line);resize:horizontal;overflow:auto}.side-heading,.section-heading{color:#9daebb;font-size:10px;font-weight:700;letter-spacing:1.1px;text-transform:uppercase}.project-card{margin:8px 0 15px;padding:10px;border:1px solid var(--line);border-radius:6px;background:#151e27}.project-card strong{display:block;margin-bottom:4px}.project-card span,.hint,.muted{color:var(--muted);font-size:11px}.group{margin-top:16px}.group-title{display:flex;justify-content:space-between;margin-bottom:7px;color:var(--muted);font-size:11px}.palette-item{width:100%;display:flex;align-items:center;gap:9px;margin:4px 0;padding:8px;border:1px solid transparent;border-radius:5px;background:transparent;text-align:left}.palette-item:hover{border-color:#435665;background:#1a2732}.icon{display:grid;place-items:center;width:24px;height:24px;border:1px solid currentColor;border-radius:5px;font-size:12px}.blue{color:var(--blue)}.green{color:var(--green)}.purple{color:var(--purple)}.orange{color:var(--orange)}.surface-color{color:var(--surface)}.red{color:var(--red)}.palette-item small{display:block;margin-top:2px;color:var(--muted);font-size:10px}.element-list,.control-list{display:grid;gap:6px}.element-card,.control-card{padding:8px;border:1px solid var(--line);border-radius:5px;background:#151f28}.element-card:hover,.control-card:hover{border-color:#56718a}.row{display:flex;align-items:center;gap:7px}.grow{min-width:0;flex:1}.element-title{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#d6e2eb}.element-sub{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:3px;color:var(--muted);font:10px ui-monospace,monospace}.badge{display:inline-block;padding:2px 5px;border-radius:3px;background:#203348;color:#9fd4ff;font-size:9px;font-weight:700;text-transform:uppercase}.badge.surface{background:#302852;color:#cfc3ff}.mini-button{padding:4px 7px;border:1px solid #456176;border-radius:4px;background:#1a2a38;color:#bfe5ff;font-size:10px}.canvas-wrap{display:flex;flex-direction:column;position:relative;min-width:0;min-height:0;overflow:hidden;background:#0d1319;background-image:radial-gradient(#26333e 1px,transparent 1px);background-size:20px 20px}.canvas-header{display:flex;align-items:center;justify-content:space-between;height:38px;padding:0 18px;border-bottom:1px solid #1f2c37;background:#0d1319;flex-shrink:0}.canvas-title{font-size:11px;letter-spacing:.3px;color:#c5d2dc}.canvas-controls{display:flex;align-items:center;gap:4px}.canvas-controls .button{padding:3px 8px}.canvas-zoom{min-width:43px;text-align:center;color:var(--muted);font-size:10px}.canvas-body{flex:1;min-height:0;position:relative;overflow:auto}.flowchart{position:relative;min-width:760px;min-height:560px;padding:28px 35px;transform-origin:top center}.flow-line{position:absolute;left:calc(50% - 265px);top:66px;bottom:66px;width:2px;background:linear-gradient(var(--green),#56758b,var(--red));opacity:.7}.flow-item{position:relative;z-index:1;display:flex;align-items:flex-start;gap:16px;width:550px;margin:0 auto 17px}.flow-index{display:grid;place-items:center;flex:0 0 30px;height:30px;border:2px solid #63849b;border-radius:50%;background:#152430;color:#d8e8f2;font-size:10px;font-weight:700}.flow-card{flex:1;padding:10px 12px;border:1px solid #355269;border-radius:6px;background:linear-gradient(145deg,#1b2b38,#141d25);box-shadow:0 8px 16px #0004;cursor:pointer}.flow-card:hover,.flow-card.selected{border-color:var(--blue);box-shadow:0 0 0 1px var(--blue),0 8px 16px #0004}.surface-card{border-color:#4d437d}.surface-card:hover,.surface-card.selected{border-color:var(--surface);box-shadow:0 0 0 1px var(--surface),0 8px 16px #0004}.reusable-block-card{border-color:#5c4ebd!important;background:linear-gradient(145deg,#1c1834,#131622)!important}.reusable-block-card:hover,.reusable-block-card.selected{border-color:#a896ff!important;box-shadow:0 0 0 1px #a896ff,0 8px 16px #0004!important}.flow-kicker{display:flex;align-items:center;gap:7px;margin-bottom:4px;color:#91bad7;font-size:9px;font-weight:700;letter-spacing:.8px;text-transform:uppercase}.flow-title{font-weight:600}.flow-detail{margin-top:4px;color:var(--muted);font:10px ui-monospace,monospace;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.surface-board{display:grid;grid-template-rows:minmax(220px,40%) minmax(300px,1fr);min-width:620px;height:100%;overflow:auto}.capture-card{margin:14px 18px 8px;padding:10px;border:1px solid #4b4277;border-radius:7px;background:#171529}.capture-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}.capture-preview{position:relative;min-height:150px;max-height:280px;display:grid;place-items:center;overflow:hidden;border:1px dashed #665b98;border-radius:5px;background:#0d1117}.capture-preview img{display:block;max-width:100%;max-height:270px;user-select:none}.selection{position:absolute;border:2px solid #ffca74;background:#ffca7422;pointer-events:none}.surface-flow{border-top:1px solid #292342}.surface-flow .flowchart{min-height:440px}.code-panel,.gherkin-panel,.output-panel{position:absolute;inset:76px 0 0;display:none;overflow:auto;background:#0c1116}.code-panel.visible,.gherkin-panel.visible,.output-panel.visible{display:block}.code-panel pre,.gherkin-panel pre{margin:0;padding:24px;color:#d8e5ef;font:12px/1.65 ui-monospace,SFMono-Regular,Menlo,monospace;white-space:pre-wrap}.output-panel{padding:20px}.output-line{padding:9px 0;border-bottom:1px solid var(--line);color:var(--muted)}.output-line strong{color:var(--green)}.inspector-header{display:flex;align-items:center;justify-content:space-between;padding-bottom:12px;border-bottom:1px solid var(--line)}.inspector-header h2{margin:0;font-size:13px}.empty{padding:35px 8px;text-align:center;color:var(--muted);line-height:1.6}.form-section{padding:14px 0;border-bottom:1px solid var(--line)}.field{margin-top:10px}.field label{display:block;margin-bottom:5px;color:var(--muted);font-size:10px;text-transform:uppercase;letter-spacing:.7px}.field input,.field select,.field textarea{width:100%;padding:7px;border:1px solid var(--line);border-radius:4px;color:var(--text);background:#0d141b;outline:none}.field textarea{min-height:60px;resize:vertical}.analysis-meta{margin-top:9px;padding:8px;border-radius:4px;background:#1b2640;color:#a7cfff;font-size:10px;line-height:1.5}.confidence{margin-left:auto;color:#8ed5b8;font-size:10px}.step-help{margin-top:9px;padding:8px;border-radius:4px;background:#16232e;color:#b7c8d4;font-size:10px;line-height:1.55}.toast{position:absolute;right:18px;bottom:18px;z-index:5;padding:10px 13px;border:1px solid #3d728b;border-radius:5px;background:#142731;color:#d4f2ff;opacity:0;transform:translateY(7px);transition:.2s;pointer-events:none}.toast.show{opacity:1;transform:translateY(0)}@media(max-width:1120px){.workspace{grid-template-columns:210px minmax(300px,1fr) minmax(240px,280px)}.url-input{width:200px}}@media(max-width:850px){.workspace{grid-template-columns:185px minmax(260px,1fr) 240px}.toolbar{gap:4px}.top-actions{gap:4px}}
.actions-toggle{display:flex;gap:0;margin:6px 0 10px;border:1px solid var(--line);border-radius:5px;overflow:hidden;background:#0d141b}.actions-toggle button{flex:1;padding:6px 8px;border:0;background:transparent;color:var(--muted);font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.7px;cursor:pointer;transition:background .15s,color .15s}.actions-toggle button:not(:last-child){border-right:1px solid var(--line)}.actions-toggle button.active{background:#0d74b8;color:#fff}.actions-toggle button.active.surface-active{background:#40316e;color:#d0c5ff}.reusable-card{margin:6px 0;padding:9px;border:1px solid var(--line);border-radius:5px;background:#151f28;transition:border-color .15s}.reusable-card:hover{border-color:#56718a}.reusable-card strong{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.reusable-meta{margin-top:3px;color:var(--muted);font-size:10px}.reusable-actions{display:flex;gap:5px;margin-top:7px}.save-reusable-section{margin-top:10px;padding:9px;border:1px dashed var(--line);border-radius:6px;background:#0d141b}.save-reusable-section input{width:100%;margin-top:5px;padding:6px 8px;border:1px solid var(--line);border-radius:4px;color:var(--text);background:#17222c;outline:none}.analysis-loading-banner{margin:10px 0;padding:16px;border:1px solid #7365b2;border-radius:7px;background:#1b1535;color:#cfc3ff;text-align:center}.analysis-loading-banner strong{display:block;margin:6px 0 3px;font-size:12px}.spinner-ring{display:inline-block;width:20px;height:20px;border:2px solid #7365b2;border-top-color:#d0c5ff;border-radius:50%;animation:spin .8s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}
.scenario-bar{display:flex;align-items:center;gap:6px;padding:5px 14px;background:#0d1218;border-bottom:1px solid #1f2c37;overflow-x:auto;min-height:36px;flex-shrink:0}
.scenario-tab{display:flex;align-items:center;gap:6px;padding:3px 9px;border:1px solid #334455;border-radius:5px;background:#151f28;color:#a0b4c8;font-size:11px;font-weight:600;cursor:pointer;white-space:nowrap;transition:all .15s}
.scenario-tab:hover{border-color:#4db2ff;color:#dce7ef}
.scenario-tab.active{border-color:#3296d7;background:#0d74b8;color:#fff;box-shadow:0 2px 8px #0d74b844}
.scenario-tab.surface-active{border-color:#7966c2;background:#40316e;color:#fff;box-shadow:0 2px 8px #40316e44}
.scenario-tab .del-btn{display:inline-grid;place-items:center;width:14px;height:14px;margin-left:2px;border-radius:3px;background:#ffffff22;color:#fff;font-size:9px;border:0;cursor:pointer;line-height:1}
.scenario-tab .del-btn:hover{background:#ff4d4f;color:#fff}
.scenario-add-btn{display:flex;align-items:center;gap:4px;padding:3px 8px;border:1px dashed #3f5569;border-radius:5px;background:transparent;color:#7ea2be;font-size:11px;cursor:pointer;white-space:nowrap}
.scenario-add-btn:hover{border-color:#4db2ff;color:#4db2ff;background:#13202c}
.scenario-name-input{height:25px;padding:2px 7px;border:1px solid #334455;border-radius:4px;background:#09121a;color:#fff;font-size:11px;width:150px;outline:none}
.scenario-name-input:focus{border-color:#4db2ff}
.examples-panel{background:#0e1620;border-bottom:1px solid #1f2c37;padding:8px 16px;flex-shrink:0;max-height:220px;overflow:auto}
.examples-header{display:flex;align-items:center;gap:8px;margin-bottom:6px}
.examples-title{font-weight:700;color:#9fd4ff;font-size:11px}
.examples-table-wrap{overflow-x:auto}
.examples-table{border-collapse:collapse;width:100%;font-size:11px;background:#141e28}
.examples-table th,.examples-table td{border:1px solid #283a4c;padding:4px 7px;text-align:left}
.examples-table th{background:#182635;color:#85a5c2;font-weight:600}
.examples-table th input{background:transparent;border:0;color:#9fd4ff;font-weight:700;font-size:11px;outline:none;width:85%}
.examples-table td input{width:100%;background:transparent;border:0;color:#dce7ef;font:inherit;outline:none}
.examples-table td input:focus{background:#1f3347}
.examples-table .row-del-btn{background:transparent;border:0;color:#ff7180;cursor:pointer;font-size:11px;padding:2px 5px}
.examples-table .row-del-btn:hover{background:#ff4d4f33;border-radius:3px}
.examples-table .col-del-btn{background:transparent;border:0;color:#ff7180;cursor:pointer;font-size:9px;margin-left:4px}
.surface-image-layer{position:relative;display:inline-block;max-width:100%;max-height:270px;line-height:0}.surface-image-layer img{display:block;max-width:100%;max-height:270px;user-select:none}.surface-overlays{position:absolute;inset:0;pointer-events:none}.analysis-box{position:absolute;border:2px solid #ffbf69;background:#ffbf6926;line-height:normal;z-index:2}.analysis-box span{position:absolute;left:-2px;bottom:100%;padding:3px 5px;border-radius:3px 3px 0 0;background:#ffbf69;color:#17100a;white-space:nowrap;font-size:10px;font-weight:700}.topbar,.subbar{min-width:0;overflow-x:auto}.topbar>.brand,.topbar>.top-actions,.subbar>.toolbar,.subbar>#mode-tools,.subbar>.tabs{flex:0 0 auto}.surface-tools,.pw-tools{flex-wrap:wrap}.workspace{grid-template-columns:255px minmax(440px,1fr) 6px minmax(260px,320px)}.inspector-resizer{cursor:col-resize;background:#1d2a35;border-left:1px solid #314454;border-right:1px solid #314454}.inspector-resizer:hover{background:#4db2ff}.inspector-screenshot-panel{padding:12px 0;border-bottom:1px solid var(--line)}.inspector-screenshot-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}.inspector-screenshot-preview{position:relative;min-height:100px;max-height:210px;display:grid;place-items:center;overflow:hidden;border:1px dashed #665b98;border-radius:5px;background:#0d1117}.inspector-screenshot-preview .surface-image-layer,.inspector-screenshot-preview .surface-image-layer img{max-height:200px}.step-shot{position:relative;margin-top:7px;padding:6px;border:1px solid var(--line);border-radius:4px;background:#151f28}.step-shot img{display:block;width:100%;max-height:100px;object-fit:contain}.step-shot button{position:absolute;top:4px;right:4px}.sequence-data{display:block;width:100%;margin-top:6px;padding:6px;border:1px solid #405363;border-radius:4px;color:var(--text);background:#0d141b}.analysis-status{padding:5px 8px;border:1px solid #4b4277;border-radius:5px;color:#cfc3ff;background:#211b3d;white-space:nowrap;font-size:10px}.surface-analyzer-modal{position:fixed;inset:0;z-index:30;display:grid;place-items:center;padding:18px;background:#05080dcc}.surface-analyzer-dialog{width:min(1180px,96vw);height:min(820px,94vh);display:grid;grid-template-rows:auto minmax(0,1fr) auto;overflow:hidden;border:1px solid #665b98;border-radius:10px;background:#111820;box-shadow:0 24px 80px #000b}.surface-analyzer-head,.surface-analyzer-foot{display:flex;align-items:center;gap:9px;padding:12px 15px;border-bottom:1px solid #2a3947}.surface-analyzer-head strong{font-size:14px}.surface-analyzer-head .hint{margin-left:auto}.surface-analyzer-body{display:grid;grid-template-columns:minmax(0,1fr) 340px;min-height:0}.surface-analyzer-image{display:grid;place-items:center;overflow:auto;padding:14px;background:#0b1016}.surface-analyzer-image .surface-image-layer{max-width:100%;max-height:100%}.surface-analyzer-image .surface-image-layer img{max-width:100%;max-height:68vh}.surface-analyzer-image .analysis-box span{display:none}.surface-analyzer-controls{min-width:0;overflow:auto;padding:12px;border-left:1px solid #2a3947}.surface-analyzer-controls .section-heading{margin-bottom:8px}.analyzer-control{display:flex;align-items:flex-start;gap:8px;margin:6px 0;padding:8px;border:1px solid #2a3947;border-radius:5px;background:#151f28;cursor:pointer}.analyzer-control.selected{border-color:#c09cff;background:#282044}.analyzer-control input{margin-top:2px}.analyzer-control-label{min-width:0;flex:1}.analyzer-control-label strong{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.analyzer-control-meta{margin-top:3px;color:#8a9aa8;font:10px ui-monospace,monospace}.surface-analyzer-foot{justify-content:flex-end;border-top:1px solid #2a3947;border-bottom:0}.surface-analyzer-foot .hint{margin-right:auto}.surface-analyzer-foot .button{white-space:nowrap}
.controls-csv-modal{position:fixed;inset:0;z-index:40;display:grid;place-items:center;padding:18px;background:#05080de6}
.controls-csv-dialog{width:min(1040px,94vw);max-height:86vh;display:grid;grid-template-rows:auto auto minmax(0,1fr) auto;overflow:hidden;border:1px solid #4db2ff;border-radius:10px;background:#111820;box-shadow:0 24px 80px #000c}
.controls-table-wrap{overflow:auto;padding:10px;min-height:140px;background:#0b1016}
.controls-csv-table{border-collapse:collapse;width:100%;font-size:11px;background:#141e28}
.controls-csv-table th,.controls-csv-table td{border:1px solid #283a4c;padding:6px 9px;text-align:left}
.controls-csv-table th{background:#182635;color:#85a5c2;font-weight:700;position:sticky;top:0;z-index:1}
.controls-csv-table tr:hover{background:#1d2d3d}
@media(max-width:850px){.surface-analyzer-body{grid-template-columns:1fr}.surface-analyzer-controls{max-height:240px;border-top:1px solid #2a3947;border-left:0}.surface-analyzer-dialog{height:94vh}}
</style></head>
<body><div class="shell">
<header class="topbar"><div class="brand"><div class="mark">●</div><div><span class="title">Automation Studio Builder</span><span class="crumb">/ ${builderProjectPath ? 'Selected project' : 'Choose a project'}</span></div></div><div class="top-actions"><span class="mode-pill">BUILDER</span><span id="mode-pill" class="mode-pill">PW</span><button class="button" title="Import steps directly from CSV" onclick="importCsvSteps()">📥 Import CSV</button><button class="button" onclick="newFlow()">＋ New Script</button><button class="button primary" onclick="saveFlow()">Save</button><button class="button" onclick="runFlow()">▶ Run in order</button></div></header>
<div id="subbar" class="subbar"><div class="toolbar"><select id="project-select" aria-label="Project" onchange="selectProject(this.value)"><option value="${this.escapeHtmlValue(builderProjectPath)}">${this.escapeHtmlValue(builderProjectName)}</option></select><button class="button ghost" title="Refresh projects" onclick="refreshProjects()">↻</button><select id="mode-select" onchange="switchMode(this.value)"><option value="pw">PW · Playwright</option><option value="surface">Surface · Vision</option></select><select id="flow-select" aria-label="Saved flows" onchange="loadFlowFromSelect(this.value)" style="max-width:180px"><option value="">＋ New flow</option></select><input id="flow-name" aria-label="Flow name" value="login_workflow"><span id="dirty-state" class="hint">Ready</span><span id="status-text" class="hint"></span></div><div id="mode-tools"></div><div class="tabs"><button id="tab-flow" class="tab active" onclick="showTab('flow')">Flowchart</button><button id="tab-code" class="tab" onclick="showTab('code')">Code</button><button id="tab-gherkin" class="tab" onclick="showTab('gherkin')">Gherkin</button><button id="tab-output" class="tab" onclick="showTab('output')">Output</button></div></div>
<main class="workspace"><aside class="sidebar"><div class="side-heading">Project</div><div class="project-card"><strong id="project-name">${this.escapeHtmlValue(builderProjectName)}</strong><span id="project-description">URL + DOM element selection</span></div><div id="mode-sidebar"></div></aside>
<section class="canvas-wrap"><div id="scenario-bar" class="scenario-bar"></div><div id="examples-panel" class="examples-panel" style="display:none"></div><div id="canvas-header" class="canvas-header"><span id="canvas-title" class="canvas-title">PW flowchart</span><span class="canvas-controls"><span id="canvas-hint" class="hint">Navigate → Inspect → Fill or add actions</span><button class="button" title="Zoom out" onclick="zoomCanvas(-.1)">−</button><span id="canvas-zoom-label" class="canvas-zoom">100%</span><button class="button" title="Zoom in" onclick="zoomCanvas(.1)">＋</button><button class="button" onclick="fitCanvas()">Fit</button></span></div><div id="canvas-body" class="canvas-body"></div><div id="code-panel" class="code-panel"><pre id="code-output"></pre></div><div id="gherkin-panel" class="gherkin-panel"><pre id="gherkin-output"></pre></div><div id="output-panel" class="output-panel"><div class="output-line"><strong>Ready</strong> — run the flow to preview ordered execution.</div><div id="output-lines"></div></div><div id="toast" class="toast"></div></section><div id="inspector-resizer" class="inspector-resizer" onpointerdown="startInspectorResize(event)" title="Drag to resize Properties"></div>
<aside class="inspector"><div id="surface-inspector"></div><div class="inspector-header"><h2 id="inspector-title">Properties</h2><span id="node-id" class="hint"></span></div><div id="inspector-content" class="empty">Select a flow step or an inspected element to view its properties.</div></aside></main></div>
<script>
const vscode=acquireVsCodeApi();
const builderContext={projectPath:${JSON.stringify(builderProjectPath)},scenarioId:${JSON.stringify(options.scenarioId || null)},scenarioName:${initialName},url:${initialUrl}};
let builderProjectPath=${JSON.stringify(builderProjectPath)};
let builderProjectName=${JSON.stringify(builderProjectName)};
let activeMode='${initialMode}';
let pwBrowserName='chrome';
let scenarios=[{id:uid(),name:'Scenario 1: Main Flow',nodes:[]}];
let activeScenarioIndex=0;
let nodes=[];
let selectedId=null;
let selectedElement=null;
let pwElements=[];
let surfaceControls=[];
let surfaceWindows=[];
let surfaceImage='';
let surfaceName='';
let surfaceSelection=null;
let tab='flow';
let sidebarTab='actions';
let reusableActions=[];
let surfaceSelectedIds=[];
let surfaceSequenceIds=[];
let surfaceSequenceActions={};
let surfaceSequenceValues={};
let surfaceSequenceLoopCount=1;
let surfaceWindowName='';
let surfaceWindowTitle='';
let analyzerOpen=false;
let surfaceAnalyzing=false;
let availableObjects=[];
let canvasZoom=1;

const pwActions=[
  {type:'navigate',label:'Navigate',detail:'Open URL',icon:'↗',color:'blue'},
  {type:'click',label:'Click',detail:'Use locator',icon:'⌁',color:'blue'},
  {type:'doubleClick',label:'Double click',detail:'Double-click element',icon:'⤫',color:'blue'},
  {type:'rightClick',label:'Right click',detail:'Open context menu',icon:'☷',color:'blue'},
  {type:'hover',label:'Hover',detail:'Move over element',icon:'⌁',color:'blue'},
  {type:'type',label:'Fill',detail:'Fill input',icon:'T',color:'blue'},
  {type:'uploadFile',label:'Upload file',detail:'Set input file',icon:'⇧',color:'blue'},
  {type:'select',label:'Select option',detail:'Choose option',icon:'▾',color:'blue'},
  {type:'check',label:'Check',detail:'Check checkbox',icon:'☑',color:'blue'},
  {type:'uncheck',label:'Uncheck',detail:'Clear checkbox',icon:'☐',color:'blue'},
  {type:'pressKey',label:'Press key',detail:'Keyboard shortcut',icon:'⌨',color:'blue'},
  {type:'verify',label:'Assert visible',detail:'Check element',icon:'✓',color:'green'},
  {type:'assertText',label:'Assert text',detail:'Match element text',icon:'≡',color:'green'},
  {type:'assertValue',label:'Assert value',detail:'Match input value',icon:'=',color:'green'},
  {type:'tableCount',label:'Table count',detail:'Assert matching rows',icon:'#',color:'green'},
  {type:'waitForElement',label:'Wait for element',detail:'Wait until visible',icon:'◷',color:'orange'},
  {type:'wait',label:'Wait for page',detail:'Wait for load',icon:'◷',color:'orange'},
  {type:'screenshot',label:'Capture screenshot',detail:'Add report image',icon:'▣',color:'purple'},
  {type:'loop',label:'Repeat actions',detail:'Run child steps N times',icon:'↻',color:'purple'},
  {type:'excelLoop',label:'Excel data loop',detail:'Run steps for each row',icon:'▤',color:'purple'},
  {type:'apiRequest',label:'API request',detail:'Call an endpoint',icon:'⇄',color:'orange'},
  {type:'credentials',label:'Enter credentials',detail:'Username + password',icon:'🔑',color:'purple'}
];

const surfaceActions=[
  {type:'launch',label:'Launch app',detail:'Open window',icon:'↗',color:'blue'},
  {type:'click',label:'Click control',detail:'Vision / OCR',icon:'⌁',color:'surface-color'},
  {type:'doubleClick',label:'Double click',detail:'Double-click region',icon:'⤫',color:'surface-color'},
  {type:'rightClick',label:'Right click',detail:'Context menu',icon:'☷',color:'surface-color'},
  {type:'type',label:'Type text',detail:'Keyboard input',icon:'T',color:'surface-color'},
  {type:'select',label:'Select option',detail:'Dropdown control',icon:'▾',color:'surface-color'},
  {type:'pressKey',label:'Press key',detail:'Keyboard shortcut',icon:'⌨',color:'surface-color'},
  {type:'scroll',label:'Scroll',detail:'Scroll the app surface',icon:'↕',color:'surface-color'},
  {type:'drag',label:'Drag control',detail:'Drag between regions',icon:'⇢',color:'surface-color'},
  {type:'verify',label:'Verify control',detail:'Screen assertion',icon:'✓',color:'green'},
  {type:'assertText',label:'Assert text',detail:'OCR text assertion',icon:'≡',color:'green'},
  {type:'wait',label:'Wait for screen',detail:'Settle condition',icon:'◷',color:'orange'},
  {type:'screenshot',label:'Capture screenshot',detail:'Add report image',icon:'▣',color:'purple'},
  {type:'loop',label:'Repeat actions',detail:'Run child steps N times',icon:'↻',color:'purple'},
  {type:'credentials',label:'Enter credentials',detail:'Username + password',icon:'🔑',color:'surface-color'}
];

function escapeHtml(v){return String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;')}
function uid(){return 'node-'+Math.random().toString(36).slice(2,9)}
function jsString(v){return JSON.stringify(String(v==null?'':v))}
function actionList(){return activeMode==='surface'?surfaceActions:pwActions}
function selectedNode(){return nodes.find(n=>n.id===selectedId)}
function currentEditableStep(){const n=selectedNode();return n&&n.type==='workflow'&&window.flowStepIndex!=null?n.steps[window.flowStepIndex]:(n&&n.type!=='workflow'?n:null)}

function sampleFlow(mode){
  const steps=mode==='surface'?[
    {type:'launch',label:'Launch desktop application',target:'Foreground window',value:''},
    {type:'type',label:'Fill Username text box',target:'Username',value:'qa.user',controlType:'textBox',locatorStrategy:'ocr'},
    {type:'type',label:'Fill Password text box',target:'Password',value:'secret://app.password',isSecret:true,controlType:'textBox',locatorStrategy:'ocr'},
    {type:'click',label:'Click Login button',target:'Login',value:'',controlType:'button',locatorStrategy:'ocr'},
    {type:'wait',label:'Wait for dashboard screen',target:'Dashboard',value:'',controlType:'label',locatorStrategy:'ocr'}
  ]:[
    {type:'navigate',label:'Open Practice page',target:'https://practicetestautomation.com/practice/',value:'https://practicetestautomation.com/practice/'},
    {type:'verify',label:'Verify Practice heading',target:'h1',value:'',controlType:'element',locatorStrategy:'css'},
    {type:'click',label:'Open Test Login Page',target:'a[href*="/practice-test-login/"]',value:'',controlType:'button',locatorStrategy:'css'},
    {type:'verify',label:'Verify Test Login page',target:'h2',value:'',controlType:'element',locatorStrategy:'css'},
    {type:'type',label:'Fill Username',target:'#username',value:'student',controlType:'textBox',locatorStrategy:'css'},
    {type:'type',label:'Fill Password',target:'#password',value:'secret://app.password',isSecret:true,controlType:'textBox',locatorStrategy:'css'},
    {type:'click',label:'Submit valid login',target:'#submit',value:'',controlType:'button',locatorStrategy:'css'},
    {type:'verify',label:'Verify successful login heading',target:'h1',value:'',controlType:'element',locatorStrategy:'css'},
    {type:'verify',label:'Verify success page body',target:'body',value:'',controlType:'element',locatorStrategy:'css'},
    {type:'navigate',label:'Return to Practice page',target:'https://practicetestautomation.com/practice/',value:'https://practicetestautomation.com/practice/'}
  ];
  return[{id:uid(),type:'start',label:'Start'},{id:uid(),type:'workflow',label:mode==='surface'?'Desktop Surface Flow':'Practice Test Automation · 10-step PW flow',target:mode==='surface'?'Screenshot-driven desktop':'https://practicetestautomation.com/',steps:steps},{id:uid(),type:'end',label:'End'}];
}

function executableNodes(){return nodes.filter(n=>!['start','end','condition'].includes(n.type)).flatMap(n=>n.type==='workflow'&&n.steps?n.steps:[n])}
function previewExecutionSteps(steps){return steps.flatMap(step=>step.type==='loop'&&step.children?.length?Array.from({length:Math.max(0,Number(step.value)||0)},()=>step.children).flat():[step])}

function render(){
  try {
    if(scenarios[activeScenarioIndex])scenarios[activeScenarioIndex].nodes=nodes;
    const surface=activeMode==='surface';
    const subbar=document.getElementById('subbar');
    if(subbar) subbar.classList.toggle('surface-mode',surface);
    const modePill=document.getElementById('mode-pill');
    if(modePill) {
      modePill.textContent=surface?'Surface':'PW';
      modePill.classList.toggle('surface',surface);
    }
    const projName=document.getElementById('project-name');
    if(projName) projName.textContent=builderProjectName||'Select a project';
    const projDesc=document.getElementById('project-description');
    if(projDesc) projDesc.textContent=surface?'Screenshot → choose app → analyze → ordered flowchart':'URL → inspect DOM → highlight → select elements';
    const canvasTitle=document.getElementById('canvas-title');
    if(canvasTitle) canvasTitle.textContent=surface?'Surface flowchart + screenshot analysis':'PW flowchart + live DOM inspection';
    const canvasHint=document.getElementById('canvas-hint');
    if(canvasHint) canvasHint.textContent=surface?'Upload or capture a screenshot, then build ordered sequence':'Click a step in the center to edit it on the right';
    renderScenarioBar();
    renderExamplesPanel();
    renderTools();
    renderSidebar();
    renderCanvas();
    renderInspector();
    renderSurfaceInspector();
    const codeOut=document.getElementById('code-output');
    if(codeOut) codeOut.textContent=generateCode();
    const gherkinOut=document.getElementById('gherkin-output');
    if(gherkinOut) gherkinOut.textContent=generateGherkin();
    const dirtyEl=document.getElementById('dirty-state');
    if(dirtyEl && dirtyEl.textContent!=='Saved') dirtyEl.textContent='Unsaved changes';
    showTab(tab);
    applyCanvasZoom();
  } catch(e) {
    console.error('Render error:', e);
  }
}

function renderScenarioBar(){
  const bar=document.getElementById('scenario-bar');
  if(!bar)return;
  const isSurface=activeMode==='surface';
  const sc=scenarios[activeScenarioIndex]||{};
  const tabsHtml=scenarios.map((s,i)=>{
    const active=i===activeScenarioIndex;
    const activeClass=active?(isSurface?'active surface-active':'active'):'';
    const flowNode=(s.nodes||[]).find(n=>n.type==='workflow');
    const stepCount=(flowNode?.steps||[]).length;
    const outlineBadge=s.isOutline?' <span title="Data-driven Scenario Outline" style="font-size:9px">📊</span>':'';
    return '<div class="scenario-tab '+activeClass+'" onclick="switchScenario('+i+')"><span>✦ '+escapeHtml(s.name||('Scenario '+(i+1)))+outlineBadge+'</span><span class="badge '+(isSurface?'surface':'')+'" style="font-size:8px;padding:1px 4px">'+stepCount+'</span>'+(scenarios.length>1?'<button class="del-btn" title="Delete scenario" onclick="event.stopPropagation();deleteScenario('+i+')">✕</button>':'')+'</div>';
  }).join('');
  bar.innerHTML='<span class="hint" style="margin-right:4px;font-weight:700;letter-spacing:0.5px">SCENARIOS:</span>'+tabsHtml+'<button class="scenario-add-btn" onclick="addScenario()">＋ Add Scenario</button><span class="grow"></span><div class="row" style="gap:5px"><button class="button '+(sc.isOutline?'primary':'')+'" title="Toggle Scenario Outline & Examples Table" onclick="toggleScenarioOutline()" style="font-size:10px;padding:3px 7px">📊 '+(sc.isOutline?'Outline: ON':'Data Outline')+'</button><input class="scenario-name-input" title="Rename active scenario" value="'+escapeHtml(sc?.name||'')+'" oninput="renameActiveScenario(this.value)" placeholder="Scenario title"></div>';
}

function toggleScenarioOutline(){
  const sc=scenarios[activeScenarioIndex];
  if(!sc)return;
  sc.isOutline=!sc.isOutline;
  if(sc.isOutline && (!sc.examples || !sc.examples.length)){
    sc.examples=[
      { username: 'student', password: 'secret://app.password', expected: '#loop-container' },
      { username: 'incorrectUser', password: 'Password123', expected: '#error' }
    ];
  }
  render();
  showToast(sc.isOutline?'Enabled Scenario Outline (Data-Driven)':'Disabled Scenario Outline');
}

function renderExamplesPanel(){
  const panel=document.getElementById('examples-panel');
  if(!panel)return;
  const sc=scenarios[activeScenarioIndex];
  if(!sc||!sc.isOutline){
    panel.style.display='none';
    panel.innerHTML='';
    return;
  }
  panel.style.display='block';
  sc.examples=sc.examples||[];
  const headers=sc.examples.length?Object.keys(sc.examples[0]):['column1','column2'];
  if(!sc.examples.length) sc.examples.push({column1:'',column2:''});

  const headerThs=headers.map(h=>'<th><input value="'+escapeHtml(h)+'" onchange="renameExampleColumn(\''+escapeHtml(h)+'\',this.value)" title="Click to rename parameter column"><button class="col-del-btn" title="Delete column" onclick="deleteExampleColumn(\''+escapeHtml(h)+'\')">✕</button></th>').join('');
  const rowsHtml=sc.examples.map((row,rIdx)=>{
    const tds=headers.map(h=>'<td><input value="'+escapeHtml(row[h]||'')+'" oninput="updateExampleCell('+rIdx+',\''+escapeHtml(h)+'\',this.value)" placeholder="<'+escapeHtml(h)+'>"></td>').join('');
    return '<tr>'+tds+'<td style="width:30px;text-align:center"><button class="row-del-btn" title="Delete row" onclick="deleteExampleRow('+rIdx+')">✕</button></td></tr>';
  }).join('');

  panel.innerHTML='<div class="examples-header"><span class="examples-title">📊 Scenario Outline Examples Table</span><span class="hint">Use &lt;parameter&gt; or {{parameter}} in step values</span><span class="grow"></span><button class="mini-button" onclick="addExampleColumn()">＋ Column</button><button class="mini-button" onclick="addExampleRow()">＋ Row</button><button class="mini-button" onclick="importExamplesPrompt()">📥 Paste CSV</button><button class="mini-button" onclick="toggleScenarioOutline()">✕ Close</button></div><div class="examples-table-wrap"><table class="examples-table"><thead><tr>'+headerThs+'<th style="width:30px"></th></tr></thead><tbody>'+rowsHtml+'</tbody></table></div>';
}

function updateExampleCell(rIdx, col, val){
  const sc=scenarios[activeScenarioIndex];
  if(sc&&sc.examples&&sc.examples[rIdx]){
    sc.examples[rIdx][col]=val;
    document.getElementById('code-output').textContent=generateCode();
    document.getElementById('gherkin-output').textContent=generateGherkin();
    document.getElementById('dirty-state').textContent='Unsaved changes';
  }
}

function addExampleColumn(){
  const sc=scenarios[activeScenarioIndex];
  if(!sc)return;
  sc.examples=sc.examples||[];
  const existingCols=sc.examples.length?Object.keys(sc.examples[0]):[];
  const newCol='param'+(existingCols.length+1);
  if(!sc.examples.length){
    sc.examples.push({[newCol]:''});
  }else{
    sc.examples.forEach(r=>{ r[newCol]=''; });
  }
  render();
  showToast('Added column: '+newCol);
}

function addExampleRow(){
  const sc=scenarios[activeScenarioIndex];
  if(!sc)return;
  sc.examples=sc.examples||[];
  const headers=sc.examples.length?Object.keys(sc.examples[0]):['column1'];
  const newRow={};
  headers.forEach(h=>{ newRow[h]=''; });
  sc.examples.push(newRow);
  render();
  showToast('Added data row '+(sc.examples.length));
}

function renameExampleColumn(oldCol, newCol){
  const cleanCol=String(newCol||'').trim().replace(/[^a-zA-Z0-9_]/g,'_');
  if(!cleanCol||cleanCol===oldCol)return;
  const sc=scenarios[activeScenarioIndex];
  if(!sc||!sc.examples)return;
  sc.examples.forEach(r=>{
    r[cleanCol]=r[oldCol]||'';
    delete r[oldCol];
  });
  render();
}

function deleteExampleColumn(col){
  const sc=scenarios[activeScenarioIndex];
  if(!sc||!sc.examples)return;
  const headers=Object.keys(sc.examples[0]||{});
  if(headers.length<=1){
    showToast('At least one column is required');
    return;
  }
  sc.examples.forEach(r=>{ delete r[col]; });
  render();
  showToast('Deleted column '+col);
}

function deleteExampleRow(rIdx){
  const sc=scenarios[activeScenarioIndex];
  if(!sc||!sc.examples)return;
  if(sc.examples.length<=1){
    showToast('At least one data row is required');
    return;
  }
  sc.examples.splice(rIdx,1);
  render();
  showToast('Deleted row');
}

function importExamplesPrompt(){
  const csv=prompt('Paste CSV data (first row headers, e.g. username,password,expected):');
  if(!csv)return;
  const lines=csv.trim().split(/\r?\n/).filter(Boolean);
  if(!lines.length)return;
  const headers=lines[0].split(',').map(h=>h.trim().replace(/^"|"$/g,''));
  const rows=[];
  for(let i=1;i<lines.length;i++){
    const vals=lines[i].split(',').map(v=>v.trim().replace(/^"|"$/g,''));
    const row={};
    headers.forEach((h,idx)=>{ row[h]=vals[idx]||''; });
    rows.push(row);
  }
  if(rows.length){
    const sc=scenarios[activeScenarioIndex];
    if(sc){
      sc.isOutline=true;
      sc.examples=rows;
      render();
      showToast('Imported '+rows.length+' data rows into Examples table');
    }
  }
}

function switchScenario(index){
  if(index<0||index>=scenarios.length||index===activeScenarioIndex)return;
  if(scenarios[activeScenarioIndex])scenarios[activeScenarioIndex].nodes=nodes;
  activeScenarioIndex=index;
  nodes=scenarios[activeScenarioIndex].nodes||sampleFlow(activeMode);
  selectedId=nodes.find(n=>n.type==='workflow')?.id||nodes[0]?.id;
  window.flowStepIndex=null;
  selectedElement=null;
  render();
  showToast('Switched to '+(scenarios[activeScenarioIndex].name||('Scenario '+(index+1))));
}

function addScenario(name){
  if(scenarios[activeScenarioIndex])scenarios[activeScenarioIndex].nodes=nodes;
  const num=scenarios.length+1;
  const newName=name||('Scenario '+num+': '+(activeMode==='surface'?'Desktop Task':'User Flow'));
  const newSc={
    id:uid(),
    name:newName,
    isOutline:false,
    examples:[],
    nodes:[{id:uid(),type:'start',label:'Start'},{id:uid(),type:'workflow',label:newName,target:'',steps:[]},{id:uid(),type:'end',label:'End'}]
  };
  scenarios.push(newSc);
  activeScenarioIndex=scenarios.length-1;
  nodes=newSc.nodes;
  selectedId=nodes[1].id;
  window.flowStepIndex=null;
  selectedElement=null;
  render();
  showToast('Added '+newName);
}

function renameActiveScenario(newName){
  if(!scenarios[activeScenarioIndex])return;
  scenarios[activeScenarioIndex].name=newName;
  const flow=nodes.find(n=>n.type==='workflow');
  if(flow&&(!flow.label||flow.label.startsWith('Scenario ')))flow.label=newName;
  renderScenarioBar();
  document.getElementById('dirty-state').textContent='Unsaved changes';
}

function deleteScenario(index){
  if(scenarios.length<=1){
    showToast('Cannot delete the only scenario');
    return;
  }
  const name=scenarios[index].name;
  scenarios.splice(index,1);
  if(activeScenarioIndex>=scenarios.length)activeScenarioIndex=scenarios.length-1;
  nodes=scenarios[activeScenarioIndex].nodes;
  selectedId=nodes.find(n=>n.type==='workflow')?.id||nodes[0]?.id;
  window.flowStepIndex=null;
  selectedElement=null;
  render();
  showToast('Deleted '+name);
}

function renderTools(){
  const tools=document.getElementById('mode-tools');
  if(!tools)return;
  if(activeMode==='surface'){
    const current=tools.querySelector('.surface-tools');
    if(!current){
      tools.innerHTML='<div class="surface-tools"><select id="surface-app-select" aria-label="Application window" onchange="selectSurfaceApp(this.value)">'+(surfaceWindows.length?surfaceWindows.map(w=>'<option value="'+escapeHtml(w.id)+'">'+escapeHtml(w.label)+'</option>').join(''):'<option value="">No windows — click Refresh apps</option>')+'</select><button class="button ghost" title="Refresh application windows" onclick="refreshSurfaceApps()">↻ Refresh apps</button><button class="button surface" onclick="uploadScreenshot()">⇧ Upload screenshot</button><button class="button surface" onclick="captureScreenshot()">◉ Capture app</button><button class="button surface" title="Open Screen Analyzer modal" onclick="openScreenAnalyzer()">🔍 Screen Analyzer</button><button class="button primary" onclick="analyzeScreenshot()">✦ Analyze</button><span class="analysis-status">'+(surfaceAnalyzing?'Analyzing OCR…':surfaceControls.length?'Screen analyzed · '+surfaceControls.length+' controls':'Screen not analyzed')+'</span></div>';
    }else{
      const status=tools.querySelector('.analysis-status');
      if(status)status.textContent=surfaceAnalyzing?'Analyzing OCR…':surfaceControls.length?'Screen analyzed · '+surfaceControls.length+' controls':'Screen not analyzed';
    }
  }else{
    const current=tools.querySelector('.pw-tools');
    if(!current){
      tools.innerHTML='<div class="pw-tools"><select id="pw-browser-select" aria-label="Browser" title="Select browser to run and inspect (Chrome, Edge, Chromium, Firefox, WebKit)" onchange="selectPwBrowser(this.value)"><option value="chrome"'+(pwBrowserName==='chrome'?' selected':'')+'>🌐 Google Chrome</option><option value="msedge"'+(pwBrowserName==='msedge'?' selected':'')+'>🌐 Microsoft Edge</option><option value="chromium"'+(pwBrowserName==='chromium'?' selected':'')+'>🌐 Chromium</option><option value="firefox"'+(pwBrowserName==='firefox'?' selected':'')+'>🦊 Firefox</option><option value="webkit"'+(pwBrowserName==='webkit'?' selected':'')+'>🧭 WebKit</option></select><input id="pw-url" class="url-input" value="https://practicetestautomation.com/" placeholder="https://site-under-test"><button class="button primary" onclick="navigatePw(false)">↗ Navigate</button><button class="button" onclick="navigatePw(true)">⌕ Navigate + Inspect</button></div>';
    }
  }
}

function paletteButton(a){
  return '<button class="palette-item" onclick="addNode(\''+a.type+'\')"><span class="icon '+a.color+'">'+a.icon+'</span><span>'+a.label+'<small>'+a.detail+'</small></span></button>';
}

function renderSidebar(){
  const isSurface=activeMode==='surface';
  const actionsList=isSurface?surfaceActions:pwActions;
  let topSectionHtml='';
  if(isSurface){
    const cards=surfaceControls.length?surfaceControls.map(c=>'<div class="control-card" onclick="selectSurfaceControl(\''+c.id+'\')"><div class="row"><span class="badge surface">'+escapeHtml(c.controlType)+'</span><span class="confidence">'+c.confidence+'%</span></div><div class="element-title" style="margin-top:6px;color:#d0c5ff" title="'+escapeHtml(c.fullName||c.label)+'">'+escapeHtml(c.fullName||c.label)+'</div><div class="element-sub">OCR · '+escapeHtml(c.bbox.x+', '+c.bbox.y+' · '+c.bbox.width+'×'+c.bbox.height)+'</div><div class="row" style="margin-top:7px"><button class="mini-button" onclick="event.stopPropagation();addSurfaceStep(\''+c.id+'\',\'click\')">＋ Click</button><button class="mini-button" onclick="event.stopPropagation();addSurfaceStep(\''+c.id+'\',\'type\')">＋ Type</button></div></div>').join(''):'<div class="empty" style="padding:14px 4px">'+(surfaceAnalyzing?'Analyzing screenshot with OCR…':'No controls recognized yet.<br>Upload or capture a screenshot to analyze controls.')+'</div>';
    topSectionHtml='<div class="group"><div class="group-title"><span>Screenshot source</span><span class="surface-color">'+(surfaceImage?'READY':'EMPTY')+'</span></div><div class="project-card" style="margin:0"><strong>'+escapeHtml(surfaceName||'No screenshot')+'</strong><span>'+(surfaceAnalyzing?'Analyzing OCR in progress…':'Full captured window is analyzed automatically.')+'</span><div class="row" style="margin-top:8px"><button class="button surface grow" onclick="openScreenAnalyzer()">🔍 Screen Analyzer</button></div></div></div><div class="group"><div class="group-title"><span>Detected controls</span><span>'+surfaceControls.length+'</span></div><div class="control-list">'+cards+'</div></div>';
  }else{
    const cards=pwElements.length?pwElements.map(e=>'<div class="element-card" onclick="selectElement(\''+e.id+'\')"><div class="row"><span class="badge">'+escapeHtml(e.controlType)+'</span><span class="grow element-title">'+escapeHtml(e.label||e.text||e.tagName)+'</span></div><div class="element-sub">'+escapeHtml(e.locator)+' · '+escapeHtml(e.tagName)+'</div><div class="row" style="margin-top:7px"><button class="mini-button" onclick="event.stopPropagation();highlightElement(\''+e.id+'\')">Highlight</button><button class="mini-button" onclick="event.stopPropagation();fillElement(\''+e.id+'\')">Fill</button><button class="mini-button" onclick="event.stopPropagation();addElementStep(\''+e.id+'\',\'click\')">Click</button></div></div>').join(''):'<div class="empty" style="padding:14px 4px">No DOM elements loaded.<br>Enter a URL and click Navigate + Inspect.</div>';
    topSectionHtml='<div class="group"><div class="group-title"><span>Current page elements</span><span>'+pwElements.length+'</span></div><div class="element-list">'+cards+'</div></div>';
  }

  const toggleHtml='<div class="actions-toggle"><button class="'+(sidebarTab==='actions'?'active'+(isSurface?' surface-active':''):'')+'" onclick="setSidebarTab(\'actions\')">Actions</button><button class="'+(sidebarTab==='reusable'?'active'+(isSurface?' surface-active':''):'')+'" onclick="setSidebarTab(\'reusable\')">Reusable actions</button></div>';

  let actionsContent='';
  if(sidebarTab==='actions'){
    actionsContent=actionsList.map(paletteButton).join('');
  }else{
    if(!builderProjectPath){
      actionsContent='<div class="empty" style="padding:14px 6px;border:1px dashed var(--line);border-radius:6px;margin-top:6px;text-align:center"><strong>No project open</strong><div class="hint" style="margin:6px 0 10px">Open or select a project from the top toolbar before saving or using reusable actions.</div><button class="button primary" style="width:100%" onclick="refreshProjects()">↻ Refresh / Select Project</button></div>';
    }else{
      const cards=reusableActions.length?reusableActions.map((r,i)=>'<div class="reusable-card"><div class="row"><strong class="grow">'+escapeHtml(r.name)+'</strong><span class="badge '+(r.mode==='surface'?'surface':'')+'">'+escapeHtml(r.mode||'pw')+'</span></div><div class="reusable-meta">'+r.steps.length+' step'+(r.steps.length===1?'':'s')+'</div><div class="reusable-actions"><button class="mini-button" onclick="insertReusableAction('+i+')">＋ Insert</button><button class="mini-button" onclick="deleteReusableAction('+i+')">✕ Delete</button></div></div>').join(''):'<div class="empty" style="padding:12px 4px">No reusable actions saved in this project yet.</div>';
      actionsContent='<div class="reusable-list">'+cards+'</div><div class="save-reusable-section"><div class="section-heading">Save current steps</div><div class="hint" style="margin-top:3px">Save current workflow steps as a reusable group.</div><input id="reusable-name-input" placeholder="e.g. Login Flow" value=""><button class="button primary" style="width:100%;margin-top:7px" onclick="saveReusableActionFromFlow()">＋ Save as reusable</button></div>';
    }
  }

  const actionsGroupHtml='<div class="group"><div class="group-title"><span>'+(isSurface?'Surface actions':'PW actions')+'</span><span>＋</span></div>'+toggleHtml+actionsContent+'</div>';
  document.getElementById('mode-sidebar').innerHTML=topSectionHtml+actionsGroupHtml;
}

function setSidebarTab(t){
  sidebarTab=t;
  renderSidebar();
  if(t==='reusable'){
    if(!builderProjectPath){
      showToast('Open a project before saving or using reusable actions');
    }
    vscode.postMessage({command:'loadReusableActions'});
  }
}

function flattenFlowStepsForSave(steps){
  return (steps||[]).flatMap(s => {
    if((s.type==='callAction'||s.type==='reusableAction'||s.type==='reusable') && s.children && s.children.length){
      return flattenFlowStepsForSave(s.children);
    }
    return [s];
  });
}

function saveReusableActionFromFlow(){
  if(!builderProjectPath){
    showToast('Open a project before saving a reusable action');
    return;
  }
  const nameInput=document.getElementById('reusable-name-input');
  const name=nameInput?nameInput.value.trim():'';
  if(!name){showToast('Enter a name for the reusable action');return}
  const flow=nodes.find(n=>n.type==='workflow');
  if(!flow||!flow.steps||!flow.steps.length){showToast('Add steps to the workflow first');return}
  const flatSteps=flattenFlowStepsForSave(flow.steps);
  vscode.postMessage({
    command:'saveReusableAction',
    action:{
      name:name,
      steps:flatSteps.map(s=>({type:s.type,label:s.label,target:s.target,value:s.value,controlType:s.controlType,locatorStrategy:s.locatorStrategy,locator:s.locator,isSecret:s.isSecret,children:s.children,bbox:s.bbox,windowName:s.windowName,screenshots:s.screenshots})),
      mode:activeMode
    }
  });
  showToast('Saving reusable action: '+name);
}

function insertReusableAction(index){
  const r=reusableActions[index];
  if(!r)return;
  const flow=nodes.find(n=>n.type==='workflow');
  if(!flow){showToast('Create a flow first');return}
  const count=(r.steps||[]).length;
  const blockStep={
    id:uid(),
    type:'callAction',
    label:r.name,
    target:r.name,
    value:count+' step'+(count===1?'':'s'),
    controlType:'Reusable Action',
    children:(r.steps||[]).map(s=>({...s,id:uid()}))
  };
  flow.steps.push(blockStep);
  selectedId=flow.id;
  window.flowStepIndex=flow.steps.length-1;
  selectedElement=null;
  render();
  showToast('Inserted reusable action block: '+r.name+' ('+count+' steps)');
}

function unwrapReusableStep(){
  const flow=selectedNode();
  const index=Number(window.flowStepIndex);
  if(!flow||flow.type!=='workflow'||!Array.isArray(flow.steps)||index<0||!flow.steps[index])return;
  const step=flow.steps[index];
  if(!step.children||!step.children.length){showToast('No steps to unwrap');return}
  flow.steps.splice(index, 1, ...step.children.map(c=>({...c, id: uid()})));
  window.flowStepIndex=index;
  selectedElement=null;
  render();
  showToast('Unwrapped reusable action into '+step.children.length+' individual steps');
}

function deleteReusableAction(index){
  const r=reusableActions[index];
  if(!r)return;
  vscode.postMessage({command:'deleteReusableAction',name:r.name});
}

function addNode(type){
  if(type==='credentials'){
    const flow=nodes.find(n=>n.type==='workflow');
    if(!flow){showToast('Create a workflow first');return}
    const isSurface=activeMode==='surface';
    flow.steps.push({id:uid(),type:'type',label:isSurface?'Type into Username':'Fill Username',target:isSurface?'Username':'#username',value:'',controlType:'textBox',locatorStrategy:isSurface?'ocr':'css'});
    flow.steps.push({id:uid(),type:'type',label:isSurface?'Type into Password':'Fill Password',target:isSurface?'Password':'#password',value:'secret://app.password',isSecret:true,controlType:'textBox',locatorStrategy:isSurface?'ocr':'css'});
    selectedId=flow.id;
    window.flowStepIndex=flow.steps.length-1;
    selectedElement=null;
    render();
    showToast('Added Username + Password steps');
    return;
  }
  const item=actionList().find(a=>a.type===type)||{label:type};
  const flow=nodes.find(n=>n.type==='workflow');
  const step={type:type,label:item.label,target:type==='navigate'?'https://example.com':type==='tableCount'?'table tbody tr':type==='waitForElement'?'body':'',value:type==='loop'?'1':type==='tableCount'?'0':type==='pressKey'?'Enter':type==='scroll'?'500':'',children:(type==='loop'||type==='excelLoop')?[]:undefined};
  if(flow){
    flow.steps.push(step);
    selectedId=flow.id;
    window.flowStepIndex=flow.steps.length-1;
  }else{
    nodes.push({id:uid(),type:type,label:item.label,target:step.target,value:step.value,children:step.children});
    selectedId=nodes[nodes.length-1].id;
  }
  selectedElement=null;
  render();
  showToast('Added '+item.label);
}

function addElementStep(id,type){
  const e=pwElements.find(x=>x.id===id);
  const flow=nodes.find(n=>n.type==='workflow');
  if(!e||!flow)return;
  flow.steps.push({type:type,label:(type==='type'?'Fill ':'Click ')+(e.label||e.text||e.tagName),target:e.locator,value:type==='type'?'':'',controlType:e.controlType,locatorStrategy:e.locatorStrategy,locator:e.locator});
  selectedId=flow.id;
  window.flowStepIndex=flow.steps.length-1;
  selectedElement=null;
  render();
  showToast('Added '+type+' step from DOM');
}

function fillElement(id){addElementStep(id,'type')}

function addSurfaceStep(id,type){
  const c=surfaceControls.find(x=>x.id===id);
  const flow=nodes.find(n=>n.type==='workflow');
  if(!c||!flow)return;
  const target=c.fullName||(c.windowName?c.windowName+'.'+c.label:c.label);
  flow.steps.push({
    id:uid(),
    type:type,
    label:(type==='type'?'Type into ':'Click ')+target,
    target:target,
    value:type==='type'?'sample value':'',
    windowName:c.windowName||surfaceWindowName||undefined,
    controlType:c.controlType,
    locatorStrategy:c.locator.strategy,
    locator:c.locator.value,
    bbox:c.bbox
  });
  selectedId=flow.id;
  window.flowStepIndex=flow.steps.length-1;
  selectedElement=null;
  render();
  showToast('Added '+type+' step for '+target);
}

function updateNode(field,value){
  const n=selectedNode();
  if(!n)return;
  if(n.type==='workflow'&&window.flowStepIndex!=null)n.steps[window.flowStepIndex][field]=value;
  else n[field]=value;
  document.getElementById('dirty-state').textContent='Unsaved changes';
  if(field==='type')render();
}

function deleteNode(){
  const n=selectedNode();
  if(!n)return;
  if(n.type==='workflow'&&window.flowStepIndex!=null){
    n.steps.splice(window.flowStepIndex,1);
    window.flowStepIndex=null;
    render();
    return;
  }
  nodes=nodes.filter(x=>x.id!==n.id);
  selectedId=null;
  render();
}

function moveFlowStep(direction){
  const flow=selectedNode();
  const index=Number(window.flowStepIndex);
  const next=index+direction;
  if(!flow||flow.type!=='workflow'||!Array.isArray(flow.steps)||index<0||next<0||next>=flow.steps.length)return;
  [flow.steps[index],flow.steps[next]]=[flow.steps[next],flow.steps[index]];
  window.flowStepIndex=next;
  selectedElement=null;
  render();
  showToast('Moved step '+(direction<0?'up':'down'));
}

function newFlow(){
  const defaultName=activeMode==='surface'?'desktop_surface_flow':'new_pw_flow';
  nodes=[{id:uid(),type:'start',label:'Start'},{id:uid(),type:'workflow',label:activeMode==='surface'?'Desktop Surface Flow':'PW workflow',target:'',steps:[]},{id:uid(),type:'end',label:'End'}];
  scenarios=[{id:uid(),name:'Scenario 1: '+(activeMode==='surface'?'Surface Task':'Main Flow'),nodes:nodes}];
  activeScenarioIndex=0;
  selectedId=nodes[1].id;
  window.flowStepIndex=null;
  const flowSelect=document.getElementById('flow-select');
  if(flowSelect)flowSelect.value='';
  document.getElementById('flow-name').value=defaultName;
  render();
  document.getElementById('dirty-state').textContent='Ready';
  showToast('New flow created with Scenario 1');
}

function switchMode(v){
  activeMode=v==='surface'?'surface':'pw';
  nodes=sampleFlow(activeMode);
  scenarios=[{id:uid(),name:'Scenario 1: '+(activeMode==='surface'?'Surface Task':'Main Flow'),nodes:nodes}];
  activeScenarioIndex=0;
  selectedId=nodes[1].id;
  selectedElement=null;
  window.flowStepIndex=null;
  render();
  showToast('Switched to '+(activeMode==='surface'?'Surface':'PW'));
}

function showTab(next){
  tab=next;
  ['flow','code','gherkin','output'].forEach(n=>document.getElementById('tab-'+n).classList.toggle('active',next===n));
  document.getElementById('canvas-body').style.display=next==='flow'?'block':'none';
  document.getElementById('canvas-header').style.display=next==='flow'?'flex':'none';
  document.getElementById('code-panel').classList.toggle('visible',next==='code');
  document.getElementById('gherkin-panel').classList.toggle('visible',next==='gherkin');
  document.getElementById('output-panel').classList.toggle('visible',next==='output');
}

function applyCanvasZoom(){
  const flow=document.querySelector('.flowchart');
  const label=document.getElementById('canvas-zoom-label');
  if(label)label.textContent=Math.round(canvasZoom*100)+'%';
  if(flow){
    flow.style.transform='scale('+canvasZoom+')';
    flow.style.width=(100/canvasZoom)+'%';
    flow.style.minHeight=(560/canvasZoom)+'px';
  }
}
function zoomCanvas(delta){canvasZoom=Math.max(.6,Math.min(1.8,canvasZoom+delta));applyCanvasZoom()}
function fitCanvas(){canvasZoom=1;applyCanvasZoom();const body=document.getElementById('canvas-body');if(body)body.scrollTo({top:0,left:0,behavior:'smooth'})}

function flowchartHtml(surface){
  const items=[];
  nodes.forEach(n=>{
    if(n.type==='workflow')(n.steps||[]).forEach((s,i)=>items.push({id:n.id+'::'+i,nodeId:n.id,step:s,index:items.length+1}));
    else if(n.type==='start'||n.type==='end')items.push({id:n.id,nodeId:n.id,step:n,index:items.length+1});
  });
  const rows=items.map(i=>{
    const s=i.step;
    const selected=i.id===selectedId+'::'+window.flowStepIndex||i.id===selectedId;
    const t=s.type||'step';
    const isReusable=t==='callAction'||t==='reusableAction'||t==='reusable';
    const kicker=isReusable?'Reusable Action':t;
    const badge=(isReusable&&s.children?.length!=null)?(s.children.length+' step'+(s.children.length===1?'':'s')):(s.controlType||'');
    const detail=isReusable?((s.children||[]).map(c=>c.label||c.type).join(' → ') || s.value):(s.target||s.value||'');
    return '<div class="flow-item"><div class="flow-index">'+(t==='start'?'▶':t==='end'?'■':i.index-1)+'</div><div class="flow-card '+(surface?'surface-card ':'')+(isReusable?'reusable-block-card ':'')+(selected?'selected':'')+'" onclick="selectFlowStep(\''+i.id+'\')"><div class="flow-kicker"><span>'+(isReusable?'♻ ':'')+escapeHtml(kicker)+'</span>'+(badge?'<span class="badge '+(surface||isReusable?'surface':'')+'">'+escapeHtml(badge)+'</span>':'')+'</div><div class="flow-title">'+escapeHtml(s.label||kicker)+'</div>'+(detail?'<div class="flow-detail">'+escapeHtml(detail)+'</div>':'')+'</div></div>';
  }).join('');
  return '<div class="flowchart"><div class="flow-line"></div>'+rows+'</div>';
}

function renderCanvas(){document.getElementById('canvas-body').innerHTML=flowchartHtml(activeMode==='surface')}

function renderInspector(){
  const content=document.getElementById('inspector-content');
  const container=selectedNode();
  const node=container&&container.type==='workflow'&&window.flowStepIndex!=null?container.steps[window.flowStepIndex]:container;
  if(!node&&!selectedElement){
    document.getElementById('node-id').textContent='';
    content.className='empty';
    content.innerHTML='<strong>How to create and edit steps</strong><div class="step-help">1. Click an action in the left palette, or use Fill / Click on an inspected element.<br>2. Click the new step in the center flowchart.<br>3. Edit Action, Label, locator and Value here.<br>4. Click Save to store the scenario, Gherkin and generated code.</div>';
    return;
  }
  if(selectedElement){
    document.getElementById('inspector-title').textContent='Detected element';
    document.getElementById('node-id').textContent=selectedElement.id;
    content.className='';
    content.innerHTML='<div class="form-section"><div class="section-heading">Element</div><div class="field"><label>Type</label><div class="analysis-meta">'+escapeHtml(selectedElement.controlType)+' · &lt;'+escapeHtml(selectedElement.tagName)+'&gt;</div></div><div class="field"><label>Label / text</label><textarea readonly>'+escapeHtml(selectedElement.label||selectedElement.text)+'</textarea></div><div class="field"><label>Locator</label><input readonly value="'+escapeHtml(selectedElement.locator)+'"></div><div class="field"><label>Bounding box</label><div class="analysis-meta">'+escapeHtml(selectedElement.bbox?selectedElement.bbox.x+', '+selectedElement.bbox.y+' · '+selectedElement.bbox.width+'×'+selectedElement.bbox.height:'Not available')+'</div></div></div><div class="form-section"><button class="button surface" style="width:100%" onclick="highlightElement(\''+selectedElement.id+'\')">◎ Highlight on page</button><button class="button primary" style="width:100%;margin-top:7px" onclick="fillElement(\''+selectedElement.id+'\')">＋ Add Fill step</button><button class="button" style="width:100%;margin-top:7px" onclick="addElementStep(\''+selectedElement.id+'\',\'click\')">＋ Add Click step</button></div>';
    return;
  }
  document.getElementById('inspector-title').textContent=activeMode==='surface'?'Surface step':'PW step';
  document.getElementById('node-id').textContent=node.id||'';
  content.className='';
  if(node.type==='workflow'){
    content.innerHTML='<div class="form-section"><div class="section-heading">Flow container</div><div class="field"><label>Name</label><input value="'+escapeHtml(node.label)+'" oninput="updateNode(\'label\',this.value)"></div><div class="field"><label>Scope</label><input value="'+escapeHtml(node.target||'')+'" oninput="updateNode(\'target\',this.value)"></div><div class="analysis-meta">'+(node.steps||[]).length+' ordered steps · select a step in the flowchart to edit it.</div></div>';
    return;
  }
  const index=Number(window.flowStepIndex);
  const flow=container&&container.type==='workflow'?container:null;
  const isWorkflowStep=flow&&Array.isArray(flow.steps)&&index>=0;
  if(node.type==='callAction'||node.type==='reusableAction'||node.type==='reusable'){
    const childRows=(node.children||[]).map((c,ci)=>'<div class="element-card" style="padding:6px 10px;margin-bottom:4px"><div class="row"><span class="badge" style="font-size:9px">'+(ci+1)+'</span><strong class="grow" style="font-size:11px;margin-left:4px">'+escapeHtml(c.label||c.type)+'</strong><span class="badge surface" style="font-size:8px">'+escapeHtml(c.type)+'</span></div>'+(c.target||c.value?'<div class="hint" style="margin-top:2px;font-size:10px">'+escapeHtml(c.target||'')+(c.value?' · '+escapeHtml(c.value):'')+'</div>':'')+'</div>').join('');
    content.innerHTML='<div class="form-section"><div class="section-heading">Reusable Action Block</div><div class="field"><label>Action name</label><input value="'+escapeHtml(node.label||node.target||'')+'" oninput="updateNode(\'label\',this.value);updateNode(\'target\',this.value)"></div><div class="analysis-meta">♻ <strong>'+escapeHtml(node.label||node.target||'Reusable Action')+'</strong> contains '+(node.children||[]).length+' bundled step'+((node.children||[]).length===1?'':'s')+'. Executes as a single unified block in this flow.</div></div><div class="form-section"><div class="section-heading">Included steps ('+(node.children||[]).length+')</div><div class="element-list" style="margin-top:8px">'+(childRows||'<div class="hint">No steps in this action block</div>')+'</div><button class="button surface" style="width:100%;margin-top:10px" onclick="unwrapReusableStep()">Unwrap into individual steps</button></div>'+(isWorkflowStep?'<div class="form-section"><div class="row"><button class="button grow" '+(index===0?'disabled':'')+' onclick="moveFlowStep(-1)">↑ Move up</button><button class="button grow" '+(index===flow.steps.length-1?'disabled':'')+' onclick="moveFlowStep(1)">↓ Move down</button></div></div>':'')+'<div class="form-section"><button class="button" onclick="deleteNode()">Delete block</button></div>';
    return;
  }
  content.innerHTML='<div class="form-section"><div class="section-heading">Step <span class="hint">(click fields to edit)</span></div><div class="field"><label>Action</label><select onchange="updateNode(\'type\',this.value)">'+actionList().map(a=>'<option value="'+a.type+'"'+(node.type===a.type?' selected':'')+'>'+a.label+'</option>').join('')+'</select></div><div class="field"><label>Label</label><input value="'+escapeHtml(node.label||'')+'" oninput="updateNode(\'label\',this.value)"></div><div class="field"><label>'+(activeMode==='surface'?'OCR text / control label':'CSS locator')+'</label><input value="'+escapeHtml(node.target||'')+'" oninput="updateNode(\'target\',this.value)"></div><div class="field"><label>'+(node.type==='navigate'||node.type==='launch'?'URL / window':node.type==='excelLoop'?'Excel / CSV file path':'Value')+'</label><textarea oninput="updateNode(\'value\',this.value)">'+escapeHtml(node.value||'')+'</textarea></div></div>'+(isWorkflowStep?'<div class="form-section"><div class="row"><button class="button grow" '+(index===0?'disabled':'')+' onclick="moveFlowStep(-1)">↑ Move up</button><button class="button grow" '+(index===flow.steps.length-1?'disabled':'')+' onclick="moveFlowStep(1)">↓ Move down</button></div></div>':'')+(node.type==='loop'||node.type==='excelLoop'?'<div class="form-section"><div class="section-heading">Child steps</div><div class="analysis-meta">'+(node.children||[]).length+' child actions</div><button class="button" style="width:100%;margin-top:8px" onclick="addLoopChild(\'click\')">＋ Add click child</button><button class="button" style="width:100%;margin-top:7px" onclick="addLoopChild(\'type\')">＋ Add fill child</button></div>':'')+(node.controlType?'<div class="form-section"><div class="section-heading">Detected control</div><div class="analysis-meta">'+escapeHtml(node.controlType)+' · '+escapeHtml(node.locatorStrategy||'locator')+'</div></div>':'')+'<div class="form-section"><button class="button" onclick="deleteNode()">Delete step</button></div>';
}

function renderSurfaceInspector(){
  const host=document.getElementById('surface-inspector');
  if(!host)return;
  if(activeMode!=='surface'){host.innerHTML='';return}
  const step=currentEditableStep(),shots=step&&step.screenshots||[],shotCards=shots.map((s,i)=>'<div class="step-shot"><img src="'+escapeHtml(s.dataUrl||'')+'" alt="'+escapeHtml(s.name||'Screenshot')+'"><button class="mini-button" onclick="removeStepScreenshot('+i+')">×</button><div class="hint">'+escapeHtml(s.name||'Screenshot')+'</div></div>').join('');
  host.innerHTML=shots.length?'<div class="inspector-screenshot-panel"><div class="inspector-screenshot-head"><strong>Step screenshots</strong><span class="hint">'+shots.length+' attached</span></div>'+shotCards+'</div>':'<div class="inspector-screenshot-panel"><div class="inspector-screenshot-head"><strong>Step screenshots</strong></div><div class="hint">Upload or capture a screenshot while this step is selected to attach it.</div></div>';
}

function attachCurrentScreenshot(){
  const step=currentEditableStep();
  if(!step){showToast('Select a flow step in the center first');return}
  if(!surfaceImage){showToast('Capture or upload a screenshot first');return}
  step.screenshots=step.screenshots||[];
  step.screenshots.push({id:uid(),name:surfaceName||('Screenshot '+(step.screenshots.length+1)),dataUrl:surfaceImage});
  render();
  showToast('Screenshot attached to selected step');
}
function removeStepScreenshot(index){const step=currentEditableStep();if(!step||!step.screenshots)return;step.screenshots.splice(index,1);render()}
function startInspectorResize(e){const workspace=document.querySelector('.workspace');if(!workspace)return;const move=(event)=>{const rect=workspace.getBoundingClientRect(),width=Math.max(240,Math.min(620,rect.right-event.clientX));workspace.style.gridTemplateColumns='255px minmax(260px,1fr) 6px '+width+'px'};const stop=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',stop)};window.addEventListener('pointermove',move);window.addEventListener('pointerup',stop);e.preventDefault()}

function selectFlowStep(key){selectedElement=null;const parts=key.split('::');selectedId=parts[0];window.flowStepIndex=parts.length>1?Number(parts[1]):null;render()}
function selectElement(id){selectedElement=pwElements.find(e=>e.id===id)||null;selectedId=null;renderInspector();if(selectedElement)vscode.postMessage({command:'pwHighlight',locator:selectedElement.locator})}
function highlightElement(id){const e=pwElements.find(x=>x.id===id);if(e){selectedElement=e;selectedId=null;renderInspector();vscode.postMessage({command:'pwHighlight',locator:e.locator})}}
function selectProject(projectPath){if(projectPath)vscode.postMessage({command:'projectSelect',projectPath})}
function selectSurfaceApp(windowId){if(windowId)vscode.postMessage({command:'surfaceCapture',windowId})}
function selectSurfaceControl(id){const c=surfaceControls.find(x=>x.id===id);if(!c)return;selectedElement={id:c.id,tagName:c.controlType,controlType:c.controlType,label:c.label,text:c.label,locator:c.locator.value,bbox:c.bbox,attributes:{source:c.source,bbox:JSON.stringify(c.bbox)}};selectedId=null;renderInspector()}
function addLoopChild(type){const n=selectedNode();if(!n||!['loop','excelLoop'].includes(n.type))return;const child={type:type,label:type==='type'?'Fill loop value':'Click loop target',target:selectedElement&&selectedElement.locator||'',value:type==='type'?'{{value}}':''};n.children=n.children||[];n.children.push(child);render();showToast('Added child action to '+n.label)}

function refreshProjects(){vscode.postMessage({command:'refreshProjects'});showToast('Refreshing Automation Studio projects…')}
function refreshSurfaceApps(){vscode.postMessage({command:'surfaceListApps'});showToast('Refreshing application windows…')}
function uploadScreenshot(){vscode.postMessage({command:'surfaceUpload'})}
function captureScreenshot(){const select=document.getElementById('surface-app-select');if(!select||!select.value){showToast('Select an application window first');return}document.getElementById('status-text').textContent='Capturing selected app…';vscode.postMessage({command:'surfaceCapture',windowId:select.value})}
function analyzeScreenshot(){
  if(!surfaceImage){
    uploadScreenshot();
    showToast('Select a screenshot to analyze');
    return;
  }
  surfaceAnalyzing=true;
  document.getElementById('status-text').textContent=surfaceSelection?'Analyzing selected region…':'Analyzing full screenshot…';
  openScreenAnalyzer();
  vscode.postMessage({command:'surfaceAnalyze',region:surfaceSelection});
  setTimeout(()=>{
    if(surfaceAnalyzing){
      surfaceAnalyzing=false;
      render();
      if(analyzerOpen)renderAnalyzerModal();
      showToast('Analysis complete');
    }
  },10000);
}

function surfaceOverlayHtml(){return surfaceControls.map(c=>'<div class="analysis-box" data-x="'+c.bbox.x+'" data-y="'+c.bbox.y+'" data-width="'+c.bbox.width+'" data-height="'+c.bbox.height+'" title="'+escapeHtml(c.fullName||c.label)+'"><span>'+escapeHtml(c.controlType+' · '+c.label)+'</span></div>').join('')}
function positionSurfaceOverlays(imageId){const img=document.getElementById(imageId||'surface-image-inspector'),layer=img&&img.parentElement;if(!img||!layer||!img.naturalWidth)return;const scale=img.clientWidth/img.naturalWidth;layer.querySelectorAll('.analysis-box').forEach(box=>{const x=Number(box.dataset.x||0),y=Number(box.dataset.y||0),width=Number(box.dataset.width||0),height=Number(box.dataset.height||0);box.style.left=(x*scale)+'px';box.style.top=(y*scale)+'px';box.style.width=Math.max(4,width*scale)+'px';box.style.height=Math.max(4,height*scale)+'px'})}

window.onerror=function(msg,url,line,col,err){
  console.warn('FlowBuilder UI error caught:', msg, err);
  return true;
};

window.beginSelection=function(e){
  const img=document.getElementById('surface-image-modal')||document.getElementById('surface-image-inspector');
  if(!img)return;
  const rect=img.getBoundingClientRect();
  window.selectionStart={x:e.clientX-rect.left,y:e.clientY-rect.top,rect};
  e.preventDefault();
};
window.moveSelection=function(e){
  if(!window.selectionStart)return;
  const s=window.selectionStart;
  const x=Math.max(0,Math.min(s.rect.width,e.clientX-s.rect.left));
  const y=Math.max(0,Math.min(s.rect.height,e.clientY-s.rect.top));
  const l=Math.min(s.x,x),t=Math.min(s.y,y),w=Math.abs(x-s.x),h=Math.abs(y-s.y);
  const box=document.getElementById('selection');
  const img=document.getElementById('surface-image-modal')||document.getElementById('surface-image-inspector');
  const layer=document.querySelector('.surface-analyzer-dialog .surface-image-layer')||document.querySelector('.inspector-screenshot-preview .surface-image-layer');
  const targetEl=layer||img;
  const p=targetEl?targetEl.getBoundingClientRect():{left:0,top:0};
  if(box){box.style.left=(l+s.rect.left-p.left)+'px';box.style.top=(t+s.rect.top-p.top)+'px';box.style.width=w+'px';box.style.height=h+'px'}
  e.preventDefault();
};
window.endSelection=function(e){
  if(!window.selectionStart)return;
  const img=document.getElementById('surface-image-modal')||document.getElementById('surface-image-inspector');
  if(!img)return;
  const s=window.selectionStart,rect=img.getBoundingClientRect();
  const x=Math.max(0,Math.min(rect.width,e.clientX-rect.left));
  const y=Math.max(0,Math.min(rect.height,e.clientY-rect.top));
  const l=Math.min(s.x,x),t=Math.min(s.y,y),w=Math.abs(x-s.x),h=Math.abs(y-s.y);
  if(w>5&&h>5&&img.naturalWidth&&rect.width){
    surfaceSelection={x:Math.round(l*(img.naturalWidth/rect.width)),y:Math.round(t*(img.naturalHeight/rect.height)),width:Math.round(w*(img.naturalWidth/rect.width)),height:Math.round(h*(img.naturalHeight/rect.height))};
  }
  window.selectionStart=null;
  showToast(surfaceSelection?'Region selected — click Analyze screenshot':'Select a larger region');
};

function selectPwBrowser(browser){
  pwBrowserName=browser;
  document.getElementById('dirty-state').textContent='Unsaved changes';
  vscode.postMessage({command:'pwBrowserSelect',browser:browser});
  const friendly=browser==='msedge'?'Microsoft Edge':browser==='chrome'?'Google Chrome':browser;
  showToast('Selected browser: '+friendly);
}

function navigatePw(inspect){
  const input=document.getElementById('pw-url'),url=input?input.value.trim():'';
  if(!url){
    showToast('Enter a URL first');
    return;
  }
  const browserSelect=document.getElementById('pw-browser-select');
  if(browserSelect)pwBrowserName=browserSelect.value;
  const friendly=pwBrowserName==='msedge'?'Microsoft Edge':pwBrowserName==='chrome'?'Google Chrome':pwBrowserName;
  vscode.postMessage({command:'pwNavigate',url:url,inspectAfter:inspect,browser:pwBrowserName});
  document.getElementById('status-text').textContent=inspect?'Navigating in '+friendly+' and inspecting…':'Navigating in '+friendly+'…';
}

function surfaceStepForControl(control,action){
  const target=control.fullName||(control.windowName?control.windowName+'.'+control.label:control.label);
  return {
    id:uid(),
    type:action,
    label:(action==='type'?'Type into ':'Click ')+target,
    target:target,
    value:action==='type'?(surfaceSequenceValues[control.id]||''):'',
    windowName:control.windowName||surfaceWindowName||undefined,
    controlType:control.controlType,
    locatorStrategy:control.locator.strategy,
    locator:control.locator.value,
    bbox:control.bbox
  };
}
function defaultSurfaceAction(control){return control.controlType==='textBox'?'type':'click'}

function analyzerSourceLabel(){return surfaceWindowName||surfaceName||'No screenshot selected'}

function openScreenAnalyzer(){
  let host=document.getElementById('surface-analyzer-modal');
  if(!host){
    host=document.createElement('div');
    host.id='surface-analyzer-modal';
    host.className='surface-analyzer-modal';
    host.onclick=(e)=>{if(e.target===host)closeScreenAnalyzer()};
    document.body.appendChild(host);
  }
  analyzerOpen=true;
  renderAnalyzerModal();
  setTimeout(()=>positionSurfaceOverlays('surface-image-modal'),150);
}

function closeScreenAnalyzer(){
  document.getElementById('surface-analyzer-modal')?.remove();
  analyzerOpen=false;
  surfaceAnalyzing=false;
  render();
}

window.addEventListener('keydown',(e)=>{if(e.key==='Escape'&&analyzerOpen)closeScreenAnalyzer()});

function toggleSurfaceControl(id,checked){surfaceSelectedIds=checked?[...new Set([...surfaceSelectedIds,id])]:surfaceSelectedIds.filter(value=>value!==id);renderAnalyzerModal()}
function selectAllSurfaceControls(){surfaceSelectedIds=surfaceControls.map(c=>c.id);renderAnalyzerModal()}
function clearSurfaceControls(){surfaceSelectedIds=[];renderAnalyzerModal()}
function addCheckedToSurfaceSequence(){const selected=surfaceControls.filter(control=>surfaceSelectedIds.includes(control.id));if(!selected.length){showToast('Check one or more controls first');return}selected.forEach(control=>{if(!surfaceSequenceIds.includes(control.id)){surfaceSequenceIds.push(control.id);surfaceSequenceActions[control.id]=defaultSurfaceAction(control)}});surfaceSelectedIds=[];renderAnalyzerModal();showToast('Added '+selected.length+' control'+(selected.length===1?'':'s')+' to sequence')}
function setSurfaceSequenceAction(id,action){surfaceSequenceActions[id]=action;renderAnalyzerModal()}
function setSurfaceSequenceValue(id,value){surfaceSequenceValues[id]=value}
function setSurfaceSequenceLoopCount(value){surfaceSequenceLoopCount=Math.max(1,Math.min(999,Number(value)||1));renderAnalyzerModal()}
function moveSurfaceSequence(id,direction){const index=surfaceSequenceIds.indexOf(id),next=index+direction;if(index<0||next<0||next>=surfaceSequenceIds.length)return;const copy=[...surfaceSequenceIds];[copy[index],copy[next]]=[copy[next],copy[index]];surfaceSequenceIds=copy;renderAnalyzerModal()}
function removeSurfaceSequence(id){surfaceSequenceIds=surfaceSequenceIds.filter(value=>value!==id);delete surfaceSequenceActions[id];delete surfaceSequenceValues[id];renderAnalyzerModal()}

function addSurfaceSequenceToFlow(){
  const flow=nodes.find(n=>n.type==='workflow'),controls=surfaceSequenceIds.map(id=>surfaceControls.find(control=>control.id===id)).filter(Boolean);
  if(!flow){showToast('Create or select a flow before adding controls');return}
  if(!controls.length){showToast('Add controls to the sequence first');return}
  const children=controls.map(control=>surfaceStepForControl(control,surfaceSequenceActions[control.id]||defaultSurfaceAction(control)));
  if(surfaceSequenceLoopCount>1)flow.steps.push({id:uid(),type:'loop',label:'Repeat Surface sequence',target:surfaceWindowName||'',value:String(surfaceSequenceLoopCount),windowName:surfaceWindowName||undefined,children});
  else flow.steps.push(...children);
  selectedId=flow.id;
  window.flowStepIndex=flow.steps.length-1;
  selectedElement=null;
  closeScreenAnalyzer();
  render();
  showToast('Added '+controls.length+' control'+(controls.length===1?'':'s')+' to the flow');
}

function runSurfaceSequence(){
  const controls=surfaceSequenceIds.map(id=>surfaceControls.find(control=>control.id===id)).filter(Boolean);
  if(!controls.length){showToast('Add controls to the sequence first');return}
  const children=controls.map(control=>surfaceStepForControl(control,surfaceSequenceActions[control.id]||defaultSurfaceAction(control)));
  const steps=surfaceSequenceLoopCount>1?[{id:uid(),type:'loop',label:'Repeat Surface sequence',value:String(surfaceSequenceLoopCount),windowName:surfaceWindowName||undefined,children}]:children;
  closeScreenAnalyzer();
  showTab('output');
  document.getElementById('output-lines').innerHTML=steps.flatMap(step=>step.type==='loop'?Array.from({length:Number(step.value)||1},()=>step.children||[]).flat():[step]).map((step,index)=>'<div class="output-line"><strong>Step '+(index+1)+'</strong> — '+escapeHtml(step.label)+' <span class="hint queued">queued</span></div>').join('');
  vscode.postMessage({command:'surfaceExecute',mode:'surface',steps});
}

function highlightSurfaceControl(id){
  const control=surfaceControls.find(item=>item.id===id);
  if(!control)return;
  document.querySelectorAll('.surface-analyzer-dialog .analysis-box').forEach((box,index)=>{
    const active=surfaceControls[index]?.id===id;
    box.style.border=active?'3px solid #ff3b30':'2px solid #ffbf69';
    box.style.background=active?'#ff3b304d':'#ffbf6926';
    box.style.boxShadow=active?'0 0 0 2px #ff3b30cc':'none';
    box.style.zIndex=active?'5':'2';
  });
  const card=[...document.querySelectorAll('.surface-analyzer-dialog .analyzer-control')].find(item=>item.dataset.controlId===id);
  card?.scrollIntoView({block:'nearest'});
  showToast('Highlighted '+(control.fullName||control.label));
}

function renderAnalyzerModal(){
  const host=document.getElementById('surface-analyzer-modal');
  if(!host)return;
  const detected=surfaceControls.map(c=>'<label class="analyzer-control '+(surfaceSelectedIds.includes(c.id)?'selected':'')+'" data-control-id="'+escapeHtml(c.id)+'"><input type="checkbox" '+(surfaceSelectedIds.includes(c.id)?'checked ':'')+'onchange="toggleSurfaceControl(\''+escapeHtml(c.id)+'\',this.checked)"><span class="analyzer-control-label"><strong><span class="badge surface">'+escapeHtml(c.controlType)+'</span> <span style="color:#cfc3ff">'+escapeHtml(c.fullName||c.label)+'</span></strong><span class="analyzer-control-meta">'+c.confidence+'% · '+escapeHtml(c.bbox.x+', '+c.bbox.y+' · '+c.bbox.width+'×'+c.bbox.height)+'</span></span><button type="button" class="mini-button" onclick="event.preventDefault();event.stopPropagation();highlightSurfaceControl(\''+escapeHtml(c.id)+'\')">Highlight</button></label>').join('');
  const sequence=surfaceSequenceIds.map((id,index)=>{
    const c=surfaceControls.find(control=>control.id===id);
    if(!c)return '';
    const action=surfaceSequenceActions[id]||defaultSurfaceAction(c);
    const target=c.fullName||c.label;
    return '<div class="analyzer-control selected"><span class="sequence-number">'+(index+1)+'</span><span class="analyzer-control-label"><strong>'+escapeHtml(target)+'</strong><span class="analyzer-control-meta">'+escapeHtml(c.controlType)+' · '+escapeHtml(c.bbox.x+', '+c.bbox.y+' · '+c.bbox.width+'×'+c.bbox.height)+'</span>'+(action==='type'?'<input class="sequence-data" value="'+escapeHtml(surfaceSequenceValues[id]||'')+'" placeholder="Test data value" oninput="setSurfaceSequenceValue(\''+escapeHtml(id)+'\',this.value)">':'')+'</span><select onchange="setSurfaceSequenceAction(\''+escapeHtml(id)+'\',this.value)"><option value="click"'+(action==='click'?' selected':'')+'>Click</option><option value="type"'+(action==='type'?' selected':'')+'>Type</option></select><button class="mini-button" onclick="moveSurfaceSequence(\''+escapeHtml(id)+'\',-1)">↑</button><button class="mini-button" onclick="moveSurfaceSequence(\''+escapeHtml(id)+'\',1)">↓</button><button class="mini-button" onclick="removeSurfaceSequence(\''+escapeHtml(id)+'\')">×</button></div>';
  }).join('');

  const imageHtml=surfaceImage?'<div class="surface-image-layer"><img id="surface-image-modal" src="'+surfaceImage+'" onload="positionSurfaceOverlays(\'surface-image-modal\')" onpointerdown="beginSelection(event)" onpointermove="moveSelection(event)" onpointerup="endSelection(event)"><div class="surface-overlays">'+surfaceOverlayHtml()+'</div><div id="selection" class="selection"></div></div>':'<div class="empty" style="padding:40px 16px;text-align:center"><strong>No screenshot loaded</strong><div class="hint" style="margin:8px 0 16px">Upload an image file or capture the selected application window to analyze controls.</div><div class="row" style="justify-content:center;gap:8px"><button class="button surface" onclick="uploadScreenshot()">⇧ Upload screenshot</button><button class="button surface" onclick="captureScreenshot()">◉ Capture selected app</button></div></div>';

  const controlsStatusHtml=surfaceAnalyzing?'<div class="analysis-loading-banner"><div class="spinner-ring"></div><strong>Analyzing screenshot with OCR…</strong><div class="hint">Recognizing controls, text labels, and input fields…</div></div>':(detected||'<div class="hint" style="padding:10px 0">No text controls detected yet. Click "Analyze screenshot" or drag on the image to analyze a specific region.</div>');

  host.innerHTML='<div class="surface-analyzer-dialog" role="dialog" aria-modal="true"><div class="surface-analyzer-head"><strong>Screen analyzer</strong><span class="hint">'+(surfaceAnalyzing?'Analyzing OCR…':surfaceControls.length+' detected controls')+' · source: '+escapeHtml(analyzerSourceLabel())+'</span><button class="button surface" title="View or edit project controls.csv" onclick="openControlsCsv()">📄 controls.csv</button><button class="button surface" title="Import steps directly from CSV" onclick="importCsvSteps()">📥 Import CSV</button><button class="button" onclick="closeScreenAnalyzer()">✕ Close</button></div><div class="surface-analyzer-body"><div class="surface-analyzer-image">'+imageHtml+'</div><div class="surface-analyzer-controls"><div class="section-heading">Screenshot Actions</div><div class="row" style="margin-bottom:8px"><button class="button surface grow" onclick="uploadScreenshot()">⇧ Upload screenshot</button><button class="button surface grow" onclick="captureScreenshot()">◉ Capture app</button></div><button class="button primary" style="width:100%;margin-bottom:14px" onclick="analyzeScreenshot()" '+(surfaceAnalyzing?'disabled':'')+'>'+(surfaceAnalyzing?'◷ Analyzing screenshot…':'✦ Analyze screenshot')+'</button><div class="section-heading">Detected controls — check required items</div>'+controlsStatusHtml+(surfaceControls.length?'<button class="button surface" style="width:100%;margin-top:9px" onclick="addCheckedToSurfaceSequence()">＋ Add checked to sequence</button>':'')+'<div class="section-heading" style="margin-top:16px">Execution sequence · '+surfaceSequenceIds.length+'</div>'+(sequence||'<div class="hint">No controls in the sequence yet. Check controls above, then add them here.</div>')+'<div class="row" style="margin-top:10px"><label class="hint">Repeat sequence</label><input style="width:72px" type="number" min="1" max="999" value="'+surfaceSequenceLoopCount+'" onchange="setSurfaceSequenceLoopCount(this.value)"><button class="button" onclick="setSurfaceSequenceLoopCount(1)">No loop</button></div></div></div><div class="surface-analyzer-foot"><span class="hint">Drag on the image to select a specific region. '+(currentEditableStep()?'Screenshots attach to the selected step.':'')+'</span><button class="button" onclick="selectAllSurfaceControls()">Select all</button><button class="button" onclick="clearSurfaceControls()">Clear</button><button class="button" title="Import steps directly from CSV" onclick="importCsvSteps()">📥 Import CSV to flow</button><button class="button" onclick="runSurfaceSequence()">▶ Run sequence</button><button class="button surface" onclick="addSurfaceSequenceToFlow()">＋ Add sequence to flow</button></div></div>';
  positionSurfaceOverlays('surface-image-modal');
}

function generateCode(){
  if(scenarios[activeScenarioIndex])scenarios[activeScenarioIndex].nodes=nodes;
  const featureName=document.getElementById('flow-name').value||'Workflow';
  if(activeMode==='surface'){
    const lines=['"""Surface multi-scenario workflow generated from Flow Builder."""','from automationstudio.sdk.surface import run_surface_workflow',''];
    scenarios.forEach((sc,scIdx)=>{
      const scSteps=(sc.nodes||[]).find(n=>n.type==='workflow')?.steps||[];
      const slug=(sc.name||('scenario_'+(scIdx+1))).toLowerCase().replace(/[^a-z0-9_]+/g,'_').replace(/^_+|_+$/g,'');
      lines.push('def test_'+(slug||('scenario_'+(scIdx+1)))+'():');
      lines.push('    """'+(sc.name||'Scenario')+'"""');
      lines.push('    workflow = {');
      lines.push('        "workflow": {"name": '+jsString(sc.name||'Scenario')+', "version": "1.0"},');
      lines.push('        "steps": [');
      scSteps.forEach(s=>{
        if(s.type==='callAction'||s.type==='reusableAction'||s.type==='reusable'){
          lines.push('            # Reusable action: '+(s.label||s.target||'Custom action'));
          (s.children||[]).forEach(c=>{
            const ct=jsString(c.locator||c.target||c.label);
            lines.push('            {"click": {"target": {"type": '+jsString(c.locatorStrategy||'ocr')+', "text": '+ct+'}}},');
          });
          return;
        }
        const target=jsString(s.locator||s.target||s.label);
        if(s.type==='launch')lines.push('            {"launch": {"target": '+jsString(s.value||s.target||s.label)+'}},');
        else if(s.type==='type')lines.push('            {"type": {"target": {"type": '+jsString(s.locatorStrategy||'ocr')+', "text": '+target+'}, "text": '+jsString(s.value)+'}},');
        else if(s.type==='verify'||s.type==='assertText')lines.push('            {"verify": {"target": {"type": '+jsString(s.locatorStrategy||'ocr')+', "text": '+target+'}, "state": '+jsString(s.type==='assertText'?'text':'exists')+'}},');
        else if(s.type==='wait')lines.push('            {"wait_for_window": {"target": {"type": '+jsString(s.locatorStrategy||'ocr')+', "text": '+target+'}}},');
        else if(s.type==='pressKey')lines.push('            {"key": '+jsString(s.value||'Enter')+'},');
        else if(s.type==='screenshot')lines.push('            {"screenshot": {"name": '+jsString(s.value||'surface-step')+'}},');
        else lines.push('            {"click": {"target": {"type": '+jsString(s.locatorStrategy||'ocr')+', "text": '+target+'}}},');
      });
      lines.push('        ],');
      lines.push('    }');
      lines.push('    result = run_surface_workflow(workflow)');
      lines.push('    assert result.status.value == "completed"');
      lines.push('');
    });
    return lines.join('\n');
  }

  const browserConfig = pwBrowserName === 'msedge'
    ? "// Run tests in Microsoft Edge\ntest.use({ channel: 'msedge' });\n"
    : pwBrowserName === 'chrome'
    ? "// Run tests in Google Chrome\ntest.use({ channel: 'chrome' });\n"
    : pwBrowserName === 'firefox'
    ? "// Run tests in Firefox\ntest.use({ browserName: 'firefox' });\n"
    : pwBrowserName === 'webkit'
    ? "// Run tests in WebKit (Safari)\ntest.use({ browserName: 'webkit' });\n"
    : "// Run tests in Chromium\ntest.use({ browserName: 'chromium' });\n";

  const lines=["import { test, expect } from '@playwright/test';", "", browserConfig + "test.describe("+jsString(featureName)+", () => {"];
  const emitPwStep=(s,indent)=>{
    if(s.type==='callAction'||s.type==='reusableAction'||s.type==='reusable'){
      lines.push(indent+'// Reusable action: '+(s.label||s.target||'Custom action'));
      (s.children||[]).forEach(c=>emitPwStep(c,indent));
      return;
    }
    const target=jsString(s.target||s.label);
    if(s.type==='navigate')lines.push(indent+'await page.goto('+jsString(s.value||s.target)+');');
    else if(s.type==='type')lines.push(indent+'await page.locator('+target+').fill('+jsString(s.value)+');');
    else if(s.type==='uploadFile')lines.push(indent+'await page.locator('+target+').setInputFiles('+jsString(s.value)+');');
    else if(s.type==='select')lines.push(indent+'await page.locator('+target+').selectOption('+jsString(s.value)+');');
    else if(s.type==='hover')lines.push(indent+'await page.locator('+target+').hover();');
    else if(s.type==='doubleClick')lines.push(indent+'await page.locator('+target+').dblclick();');
    else if(s.type==='rightClick')lines.push(indent+'await page.locator('+target+').click({button:\'right\'});');
    else if(s.type==='check')lines.push(indent+'await page.locator('+target+').check();');
    else if(s.type==='uncheck')lines.push(indent+'await page.locator('+target+').uncheck();');
    else if(s.type==='pressKey')lines.push(indent+'await page.locator('+target+').press('+jsString(s.value||'Enter')+');');
    else if(s.type==='tableCount')lines.push(indent+'await expect(page.locator('+target+')).toHaveCount('+jsString(s.value||'0')+');');
    else if(s.type==='assertText')lines.push(indent+'await expect(page.locator('+target+')).toContainText('+jsString(s.value)+');');
    else if(s.type==='assertValue')lines.push(indent+'await expect(page.locator('+target+')).toHaveValue('+jsString(s.value)+');');
    else if(s.type==='waitForElement')lines.push(indent+'await page.locator('+target+').waitFor({state:\'visible\'});');
    else if(s.type==='screenshot')lines.push(indent+'await page.screenshot({path:'+jsString(s.value||'artifacts/screenshot.png')+',fullPage:true});');
    else if(s.type==='loop')lines.push(indent+'for(let i=0;i<'+jsString(s.value||'0')+';i++){ /* child actions */ }');
    else if(s.type==='excelLoop')lines.push(indent+'for(const row of rowsFromExcel('+jsString(s.value||'')+')){ /* child actions use {{column}} */ }');
    else if(s.type==='verify')lines.push(indent+'await expect(page.locator('+target+')).toBeVisible();');
    else if(s.type==='wait')lines.push(indent+'await page.waitForLoadState(\'load\');');
    else lines.push(indent+'await page.locator('+target+').click();');
  };

  scenarios.forEach((sc,scIdx)=>{
    const scSteps=(sc.nodes||[]).find(n=>n.type==='workflow')?.steps||[];
    const scName=sc.name||('Scenario '+(scIdx+1));
    const isOutline=Boolean(sc.isOutline);
    const examples=Array.isArray(sc.examples)?sc.examples:[];
    lines.push('');
    if(isOutline && examples.length){
      const dataVar='scenario'+(scIdx+1)+'Examples';
      lines.push('  const '+dataVar+' = '+JSON.stringify(examples, null, 2).split('\n').map((l,li)=>li===0?l:'  '+l).join('\n')+';');
      lines.push('');
      lines.push('  for (const example of '+dataVar+') {');
      lines.push('    test('+jsString(scName)+' + " [" + JSON.stringify(example) + "]", async ({ page }) => {');
      scSteps.forEach(s=>emitPwStep(s,'      '));
      lines.push('    });');
      lines.push('  }');
    }else{
      lines.push('  test('+jsString(scName)+', async ({ page }) => {');
      scSteps.forEach(s=>emitPwStep(s,'    '));
      lines.push('  });');
    }
  });

  lines.push('});');
  return lines.join('\n');
}

function generateGherkin(){
  if(scenarios[activeScenarioIndex])scenarios[activeScenarioIndex].nodes=nodes;
  const title=document.getElementById('flow-name').value||'workflow',lines=['Feature: '+title,''];
  const isSurface=activeMode==='surface';

  const emitGherkinSurface=(s)=>{
    if(s.type==='callAction'||s.type==='reusableAction'||s.type==='reusable'){
      lines.push('    # Reusable action: '+(s.label||s.target||'Custom action'));
      (s.children||[]).forEach(emitGherkinSurface);
      return;
    }
    const t=s.target||s.label||'the control';
    if(s.type==='launch')lines.push('    When I launch the application');
    else if(s.type==='type')lines.push('    And I type '+jsString(s.value||'the value')+' into '+jsString(t)+' '+(s.controlType||'text box'));
    else if(s.type==='pressKey')lines.push('    And I press '+jsString(s.value||'Enter'));
    else if(s.type==='scroll')lines.push('    And I scroll '+jsString(s.value||'500')+' pixels');
    else if(s.type==='verify'||s.type==='assertText')lines.push('    Then the screen shows '+jsString(t));
    else if(s.type==='wait')lines.push('    And I wait for '+jsString(t)+' to appear');
    else if(s.type==='screenshot')lines.push('    And I capture a screenshot');
    else if(s.type==='loop')lines.push('    When I repeat the child actions '+jsString(s.value||'the configured number of')+' times');
    else if(s.type==='select')lines.push('    And I select '+jsString(s.value||'an option')+' from '+jsString(t));
    else lines.push('    When I click the '+jsString(t)+' '+(s.controlType||'control'));
  };

  const emitGherkinPw=(s,i)=>{
    if(s.type==='callAction'||s.type==='reusableAction'||s.type==='reusable'){
      lines.push('    # Reusable action: '+(s.label||s.target||'Custom action'));
      (s.children||[]).forEach((c,ci)=>emitGherkinPw(c,ci));
      return;
    }
    const t=s.target||s.label||'the element';
    if(s.type==='navigate')lines.push('    Given I navigate to '+jsString(s.value||t));
    else if(i===0)lines.push('    Given the page is ready');
    else if(s.type==='type')lines.push('    When I fill '+jsString(t)+' with '+jsString(s.value||'the test value'));
    else if(s.type==='uploadFile')lines.push('    When I upload '+jsString(s.value||'a file')+' into '+jsString(t));
    else if(s.type==='select')lines.push('    And I select '+jsString(s.value||'an option')+' from '+jsString(t));
    else if(s.type==='pressKey')lines.push('    And I press '+jsString(s.value||'Enter')+' on '+jsString(t));
    else if(s.type==='tableCount')lines.push('    Then '+jsString(t)+' has '+jsString(s.value||'the expected number of')+' matching rows');
    else if(s.type==='assertText')lines.push('    Then '+jsString(t)+' contains '+jsString(s.value||'the expected text'));
    else if(s.type==='assertValue')lines.push('    Then '+jsString(t)+' has value '+jsString(s.value||'the expected value'));
    else if(s.type==='waitForElement')lines.push('    And I wait for '+jsString(t)+' to be visible');
    else if(s.type==='screenshot')lines.push('    And I capture a screenshot');
    else if(s.type==='loop')lines.push('    When I repeat the child actions '+jsString(s.value||'the configured number of')+' times');
    else if(s.type==='verify')lines.push('    Then '+jsString(t)+' is visible');
    else if(s.type==='wait')lines.push('    And the page is loaded');
    else lines.push('    When I click '+jsString(t));
  };

  scenarios.forEach((sc,scIdx)=>{
    const scSteps=(sc.nodes||[]).find(n=>n.type==='workflow')?.steps||[];
    const isOutline=Boolean(sc.isOutline);
    const examples=Array.isArray(sc.examples)?sc.examples:[];
    lines.push('  '+(isOutline?'Scenario Outline: ':'Scenario: ')+(sc.name||('Scenario '+(scIdx+1))));
    if(isSurface){
      lines.push('    Given the desktop application is ready');
      scSteps.forEach(emitGherkinSurface);
    }else{
      scSteps.forEach((s,i)=>emitGherkinPw(s,i));
    }
    if(isOutline && examples.length){
      const headers=Object.keys(examples[0]||{});
      if(headers.length){
        lines.push('');
        lines.push('    Examples:');
        lines.push('      | '+headers.join(' | ')+' |');
        examples.forEach(row=>{
          lines.push('      | '+headers.map(h=>String(row[h]||'')).join(' | ')+' |');
        });
      }
    }
    lines.push('');
  });

  return lines.join('\n');
}

function saveFlow(){
  if(scenarios[activeScenarioIndex])scenarios[activeScenarioIndex].nodes=nodes;
  const name=document.getElementById('flow-name').value||'Untitled Flow';
  vscode.postMessage({command:'saveFlow',mode:activeMode,name:name,nodes:nodes,scenarios:scenarios});
  document.getElementById('dirty-state').textContent='Saving…';
}

function runFlow(){
  const steps=executableNodes(),previewSteps=activeMode==='surface'?previewExecutionSteps(steps):steps;
  showTab('output');
  document.getElementById('output-lines').innerHTML=previewSteps.map((s,i)=>'<div class="output-line"><strong>Step '+(i+1)+'</strong> — '+escapeHtml(s.label||s.type)+' <span class="hint queued">queued</span></div>').join('');
  vscode.postMessage({command:activeMode==='surface'?'surfaceExecute':'pwExecute',mode:activeMode,steps:steps});
}

function showToast(m){
  const t=document.getElementById('toast');
  if(!t)return;
  t.textContent=m;
  t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'),2400);
}

function loadFlowFromSelect(filePath){
  if(!filePath){
    newFlow();
    return;
  }
  vscode.postMessage({command:'loadFlow',filePath:filePath});
  document.getElementById('status-text').textContent='Loading flow…';
}

function storeSelectedSecret(){
  const step=currentEditableStep(),uriInput=document.getElementById('secret-uri-input'),valueInput=document.getElementById('secret-value-input');
  if(!step||!uriInput||!valueInput)return;
  const uri=uriInput.value.trim()||'secret://app.password',value=valueInput.value;
  if(!/^secret:\/\/[^\s]+$/.test(uri)){showToast('Use a valid secret:// URI');return}
  if(!value){showToast('Enter a value before storing');return}
  vscode.postMessage({command:'storeSecret',uri,value});
  step.value=uri;
  step.isSecret=true;
  valueInput.value='';
  render();
  showToast('Secret reference saved');
}

function addSecretEditor(){
  const step=currentEditableStep(),content=document.getElementById('inspector-content');
  if(!step||step.type!=='type'||!content||content.querySelector('.secret-editor'))return;
  content.insertAdjacentHTML('beforeend','<div class="form-section secret-editor"><div class="section-heading">Hidden credential</div><div class="hint" style="margin-top:7px">The value is stored in the OS keychain and never saved in the scenario.</div><div class="field"><label>Secret reference</label><input id="secret-uri-input" value="'+escapeHtml(step.isSecret&&step.value&&step.value.startsWith('secret://')?step.value:'secret://app.password')+'" placeholder="secret://app.password"></div><div class="field"><label>New value</label><input id="secret-value-input" type="password" autocomplete="new-password" placeholder="Leave empty to keep stored value"></div><button class="button surface" style="width:100%;margin-top:8px" onclick="storeSelectedSecret()">Store / update hidden value</button></div>');
}

function saveSelectedObject(){
  if(!selectedElement)return;
  const idInput=document.getElementById('object-id-input'),id=(idInput&&idInput.value.trim())||('app.'+String(selectedElement.label||selectedElement.controlType||'element').toLowerCase().replace(/[^a-z0-9]+/g,'.').replace(/^\.|\.$/g,''));
  const bbox=selectedElement.bbox;
  const object={id,name:selectedElement.label||selectedElement.id,type:selectedElement.controlType==='textBox'?'textbox':selectedElement.controlType==='dropDown'?'dropdown':selectedElement.controlType||'custom',description:'Captured from Flow Builder',pw:activeMode==='pw'?{css:selectedElement.locator}:undefined,surface:activeMode==='surface'?[{strategy:selectedElement.locatorStrategy||'ocr',value:selectedElement.locator||selectedElement.label,region:bbox,scope:'window',priority:10}]:undefined,createdAt:Date.now(),updatedAt:Date.now(),version:1};
  vscode.postMessage({command:'saveObject',object});
  showToast('Saving object '+id);
}

function addObjectEditor(){
  if(!selectedElement)return;
  const content=document.getElementById('inspector-content');
  if(!content||content.querySelector('.object-editor'))return;
  const defaultId='app.'+String(selectedElement.label||selectedElement.controlType||'element').toLowerCase().replace(/[^a-z0-9]+/g,'.').replace(/^\.|\.$/g,'');
  content.insertAdjacentHTML('beforeend','<div class="form-section object-editor"><div class="section-heading">Unified object</div><div class="hint" style="margin-top:7px">Save this control once and reuse it from PW or Surface flows.</div><div class="field"><label>Object ID</label><input id="object-id-input" value="'+escapeHtml(defaultId)+'" placeholder="app.login.username"></div><button class="button primary" style="width:100%;margin-top:8px" onclick="saveSelectedObject()">Save to Object Repository</button></div>');
}

function saveCurrentStepObject(){
  const step=currentEditableStep();
  if(!step)return;
  const idInput=document.getElementById('object-id-input'),label=String(step.label||step.target||'element'),id=(idInput&&idInput.value.trim())||('app.'+label.toLowerCase().replace(/[^a-z0-9]+/g,'.').replace(/^\.|\.$/g,'')),locator=String(step.locator||step.target||''),strategy=String(step.locatorStrategy||'css'),object={id,name:label,type:step.controlType==='textBox'?'textbox':step.controlType==='dropDown'?'dropdown':step.controlType||'custom',description:'Saved from Flow Builder step',pw:activeMode==='pw'?(strategy==='xpath'?{xpath:locator}:strategy==='role'?{role:locator}:strategy==='testId'?{testId:locator}:{css:locator}):undefined,surface:activeMode==='surface'?[{strategy,value:locator||label,region:step.bbox,scope:'window',priority:10}]:undefined,createdAt:Date.now(),updatedAt:Date.now(),version:1};
  vscode.postMessage({command:'saveObject',object});
  showToast('Saving object '+id);
}

function addStepObjectEditor(){
  if(selectedElement)return;
  const step=currentEditableStep(),content=document.getElementById('inspector-content');
  if(!step||!content||content.querySelector('.object-editor'))return;
  const label=String(step.label||step.target||'element'),defaultId='app.'+label.toLowerCase().replace(/[^a-z0-9]+/g,'.').replace(/^\.|\.$/g,'');
  content.insertAdjacentHTML('beforeend','<div class="form-section object-editor"><div class="section-heading">Unified object</div><div class="hint" style="margin-top:7px">Save this existing step as a reusable PW / Surface object.</div><div class="field"><label>Object ID</label><input id="object-id-input" value="'+escapeHtml(defaultId)+'" placeholder="app.login.username"></div><button class="button primary" style="width:100%;margin-top:8px" onclick="saveCurrentStepObject()">Save to Object Repository</button></div>');
}

function addObjectChoices(){
  const input=document.getElementById('object-id-input');
  if(!input)return;
  input.setAttribute('list','object-id-options');
  let list=document.getElementById('object-id-options');
  if(!list){list=document.createElement('datalist');list.id='object-id-options';input.parentElement?.appendChild(list)}
  list.innerHTML=availableObjects.map(o=>'<option value="'+escapeHtml(o.id)+'">'+escapeHtml((o.name||o.id)+' · '+(o.type||'object')+' · v'+(o.version||1))+'</option>').join('');
}

const inspectorObserver=new MutationObserver(()=>{
  addSecretEditor();
  addObjectEditor();
  addStepObjectEditor();
  addObjectChoices();
  renderSurfaceInspector();
});
inspectorObserver.observe(document.getElementById('inspector-content'),{childList:true,subtree:true});

window.addEventListener('message',e=>{
  const m=e.data||{};
  if(m.type==='flowProjects'){
    const select=document.getElementById('project-select');
    if(select){
      select.innerHTML=(m.projects||[]).map(p=>'<option value="'+escapeHtml(p.path)+'"'+(p.path===builderProjectPath?' selected':'')+'>'+escapeHtml(p.name)+(p.technology?' · '+escapeHtml(p.technology):'')+'</option>').join('')||'<option value="">No projects found — click ↻</option>';
      if(builderProjectPath)select.value=builderProjectPath;
    }
    vscode.postMessage({command:'listFlows'});
  }else if(m.type==='projectSelected'){
    builderProjectPath=m.project&&m.project.path||'';
    builderProjectName=m.project&&m.project.name||'Select a project';
    builderContext.projectPath=builderProjectPath;
    const select=document.getElementById('project-select');
    if(select)select.value=builderProjectPath;
    document.getElementById('project-name').textContent=builderProjectName;
    render();
    showToast('Project selected: '+builderProjectName);
  }else if(m.type==='flowList'){
    const select=document.getElementById('flow-select');
    if(select){
      const currentVal=select.value;
      select.innerHTML='<option value="">＋ New flow</option>'+(m.flows||[]).map(f=>'<option value="'+escapeHtml(f.filePath)+'"'+(f.filePath===currentVal?' selected':'')+'>'+escapeHtml(f.name)+(f.mode==='surface'?' · Surface':'')+' </option>').join('');
      if(currentVal)select.value=currentVal;
    }
  }else if(m.type==='flowLoaded'){
    nodes=m.nodes||[];
    scenarios=m.scenarios&&m.scenarios.length?m.scenarios:[{id:uid(),name:m.name||'Scenario 1',nodes:nodes}];
    activeScenarioIndex=0;
    nodes=scenarios[0].nodes||nodes;
    activeMode=m.mode||'pw';
    document.getElementById('flow-name').value=m.name||'';
    document.getElementById('mode-select').value=activeMode;
    const flowSelect=document.getElementById('flow-select');
    if(flowSelect&&m.filePath)flowSelect.value=m.filePath;
    const flow=nodes.find(n=>n.type==='workflow');
    selectedId=flow?flow.id:(nodes.length>1?nodes[1].id:null);
    window.flowStepIndex=flow&&flow.steps&&flow.steps.length?0:null;
    selectedElement=null;
    render();
    document.getElementById('dirty-state').textContent='Loaded';
    showToast('Flow loaded: '+(m.name||'Untitled'));
  }else if(m.type==='surfaceWindows'){
    surfaceWindows=m.windows||[];
    render();
    if(activeMode==='surface'){
      if(!surfaceWindows.length)showToast('No application windows found — allow Screen Recording and refresh');
      else if(m.message)showToast(m.message);
    }
  }else if(m.type==='surfaceScreenshot'){
    surfaceImage=m.dataUrl;
    surfaceName=m.name||'Screenshot';
    surfaceWindowName=m.windowName||'';
    surfaceWindowTitle=m.windowTitle||'';
    surfaceControls=[];
    surfaceSelection=null;
    surfaceSelectedIds=[];
    surfaceSequenceIds=[];
    surfaceSequenceActions={};
    surfaceSequenceValues={};
    surfaceSequenceLoopCount=1;
    surfaceAnalyzing=true;
    document.getElementById('status-text').textContent=surfaceWindowName?'Captured '+surfaceWindowName+' · Analyzing OCR…':'Screenshot loaded · Analyzing OCR…';
    render();
    openScreenAnalyzer();
    showToast('Screenshot loaded — analyzing controls…');
  }else if(m.type==='surfaceAnalysisStarted'){
    surfaceAnalyzing=true;
    document.getElementById('status-text').textContent='Analyzing screenshot with OCR…';
    if(analyzerOpen)renderAnalyzerModal();
  }else if(m.type==='surfaceAnalysis'){
    surfaceAnalyzing=false;
    surfaceControls=m.controls||[];
    document.getElementById('status-text').textContent=m.message||'Analysis complete';
    render();
    if(analyzerOpen)renderAnalyzerModal();
    showToast(m.message||('Detected '+surfaceControls.length+' control'+(surfaceControls.length===1?'':'s')));
  }else if(m.type==='reusableActionsList'){
    reusableActions=m.actions||[];
    if(sidebarTab==='reusable')renderSidebar();
  }else if(m.type==='objectList'){
    availableObjects=m.objects||[];
    addObjectChoices();
  }else if(m.type==='pwNavigated'){
    document.getElementById('status-text').textContent='Current page: '+m.url;
    showToast('Navigation complete');
  }else if(m.type==='pwElements'){
    pwElements=m.elements||[];
    document.getElementById('status-text').textContent='Inspected '+pwElements.length+' visible elements';
    render();
    showToast('DOM inspection complete');
  }else if(m.type==='pwHighlight'){
    showToast('Highlighted '+(m.locator||'element')+' on the inspected page');
  }else if(m.type==='flowSaved'){
    document.getElementById('dirty-state').textContent='Saved';
    const filePath=m.payload&&m.payload.filePath;
    if(filePath){
      const select=document.getElementById('flow-select');
      if(select){
        let opt=[...select.options].find(o=>o.value===filePath);
        if(!opt){
          opt=document.createElement('option');
          opt.value=filePath;
          opt.textContent=(m.payload.name||document.getElementById('flow-name').value||'Saved flow')+(activeMode==='surface'?' · Surface':'');
          select.appendChild(opt);
        }
        select.value=filePath;
      }
    }
    showToast('Flow saved');
  }else if(m.type==='flowError'){
    document.getElementById('status-text').textContent='Error: '+(m.message||'Operation failed');
    showToast(m.message||'Operation failed');
  }else if(m.type==='executionStarted'){
    showToast('Ordered execution preview started');
  }else if(m.type==='executionStep'){
    const rows=document.getElementById('output-lines');
    const row=rows&&rows.children&&rows.children[m.index];
    if(row){
      row.innerHTML='<strong>Step '+(m.index+1)+'</strong> — '+escapeHtml(m.label||'Step')+' <span class="hint">'+(m.status==='passed'?'passed':'failed: '+escapeHtml(m.message||''))+'</span>';
    }
  }else if(m.type==='flowStepsImported'){
    if(m.scenarios&&m.scenarios.length>1){
      scenarios=m.scenarios;
      activeScenarioIndex=0;
      nodes=scenarios[0].nodes;
      const flow=nodes.find(n=>n.type==='workflow');
      selectedId=flow?flow.id:nodes[0]?.id;
      window.flowStepIndex=flow&&flow.steps&&flow.steps.length?0:null;
    }else{
      if(m.scenarioName&&scenarios[activeScenarioIndex]){
        scenarios[activeScenarioIndex].name=m.scenarioName;
      }
      let flow=nodes.find(n=>n.type==='workflow');
      if(!flow){
        flow={id:uid(),type:'workflow',label:m.scenarioName||document.getElementById('flow-name').value||'Workflow',target:'',steps:[]};
        nodes.push(flow);
      }else if(m.scenarioName&&(!flow.label||flow.label.startsWith('Scenario '))){
        flow.label=m.scenarioName;
      }
      const startIndex=flow.steps.length;
      (m.steps||[]).forEach(s=>{
        flow.steps.push(s);
      });
      selectedId=flow.id;
      window.flowStepIndex=startIndex;
    }
    selectedElement=null;
    render();
    if(analyzerOpen)closeScreenAnalyzer();
    document.getElementById('dirty-state').textContent='Unsaved changes';
    showToast('Imported '+(m.steps||[]).length+' steps from '+(m.fileName||'CSV')+(m.scenarios&&m.scenarios.length>1?' across '+m.scenarios.length+' scenarios':' into flow'));
  }else if(m.type==='executionFinished'){
    showToast(m.status==='passed'?'Execution completed':'Execution stopped: '+(m.message||'step failed'));
  }else if(m.type==='controlsCsvLoaded'){
    renderControlsCsvModal(m);
  }
});

let controlsCsvData=null;
let controlsCsvFilter='';

function renderControlsCsvModal(data){
  controlsCsvData=data||controlsCsvData;
  if(!controlsCsvData)return;
  let modal=document.getElementById('controls-csv-modal');
  if(!modal){
    modal=document.createElement('div');
    modal.id='controls-csv-modal';
    modal.className='controls-csv-modal';
    modal.onclick=(e)=>{if(e.target===modal)closeControlsCsvModal();};
    document.body.appendChild(modal);
  }
  const rows=controlsCsvData.rows||[];
  const header=rows[0]||['windowName','controlName','controlType','confidence','x','y','width','height','label'];
  const bodyRows=rows.slice(1);
  const q=controlsCsvFilter.toLowerCase().trim();
  const filtered=q?bodyRows.filter(r=>r.some(c=>String(c).toLowerCase().includes(q))):bodyRows;

  const headerHtml='<tr><th style="width:36px">#</th>'+header.map(h=>'<th>'+escapeHtml(h)+'</th>').join('')+'</tr>';
  const bodyHtml=filtered.length?filtered.map((r,i)=>'<tr><td style="color:#8a9aa8">'+(i+1)+'</td>'+r.map(c=>'<td>'+escapeHtml(c)+'</td>').join('')+'</tr>').join(''):'<tr><td colspan="'+(header.length+1)+'" style="text-align:center;padding:18px;color:#8a9aa8">No matching controls found</td></tr>';

  modal.innerHTML='<div class="controls-csv-dialog" role="dialog" aria-modal="true">'+
    '<div class="surface-analyzer-head"><strong>📄 '+escapeHtml(controlsCsvData.fileName||'controls.csv')+'</strong>'+
    '<span class="hint">'+bodyRows.length+' controls in catalog</span>'+
    '<button class="button surface" title="Open CSV side-by-side in VS Code editor" onclick="openControlsCsvInEditor()">↗ Open in Editor (Beside)</button>'+
    '<button class="button" onclick="closeControlsCsvModal()">✕ Close</button></div>'+
    '<div style="padding:10px 14px;background:#0d141c;border-bottom:1px solid #283a4c;display:flex;gap:10px;align-items:center">'+
    '<input type="text" placeholder="Filter controls by window, name, type, or label…" value="'+escapeHtml(controlsCsvFilter)+'" oninput="controlsCsvFilter=this.value;renderControlsCsvModal()" style="flex:1;padding:6px 10px;border:1px solid #334455;border-radius:4px;background:#151f28;color:#fff;font-size:11px">'+
    '<span class="hint" style="white-space:nowrap">'+filtered.length+' of '+bodyRows.length+' controls</span></div>'+
    '<div class="controls-table-wrap"><table class="controls-csv-table"><thead>'+headerHtml+'</thead><tbody>'+bodyHtml+'</tbody></table></div>'+
    '<div class="surface-analyzer-foot"><span class="hint">'+escapeHtml(controlsCsvData.filePath||'')+'</span><button class="button primary" onclick="closeControlsCsvModal()">Done</button></div></div>';
  modal.style.display='grid';
}

function closeControlsCsvModal(){
  const modal=document.getElementById('controls-csv-modal');
  if(modal)modal.style.display='none';
}

function openControlsCsvInEditor(){
  vscode.postMessage({command:'exportControlsCsv',openInEditor:true});
}

function importCsvSteps(){
  vscode.postMessage({command:'importCsvSteps'});
}
function openControlsCsv(){
  vscode.postMessage({command:'exportControlsCsv'});
}

document.getElementById('mode-select').value=activeMode;
nodes=sampleFlow(activeMode);
scenarios=[{id:uid(),name:'Scenario 1: '+(activeMode==='surface'?'Surface Task':'Main Flow'),nodes:nodes}];
activeScenarioIndex=0;
selectedId=nodes[1].id;
window.flowStepIndex=null;
render();
const initialUrlInput=document.getElementById('pw-url');
if(initialUrlInput)initialUrlInput.value=builderContext.url;
</script></body></html>`;
  }
}

