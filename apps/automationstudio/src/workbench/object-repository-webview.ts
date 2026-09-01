import * as vscode from 'vscode';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { UnifiedFileSystemObjectRepository } from '@automation-studio/sdk';
import type { UnifiedObject } from '@automation-studio/sdk';

type ObjectPreview = UnifiedObject & { screenshotDataUrl?: string };

export class ObjectRepositoryWebviewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'automationStudio.objectRepository';
  private view?: vscode.WebviewView;
  private selectedId?: string;
  private readonly watcher: vscode.FileSystemWatcher;

  constructor(private readonly projectPathProvider: () => string | undefined) {
    this.watcher = vscode.workspace.createFileSystemWatcher('**/*.json');
    this.watcher.onDidChange(() => { void this.refresh(); });
    this.watcher.onDidCreate(() => { void this.refresh(); });
    this.watcher.onDidDelete(() => { void this.refresh(); });
  }

  public async resolveWebviewView(view: vscode.WebviewView): Promise<void> {
    this.view = view;
    view.webview.options = { enableScripts: true };
    view.webview.onDidReceiveMessage(async (message) => {
      if (message?.command === 'selectObject') {
        this.selectedId = String(message.id || '');
        await this.render();
      } else if (message?.command === 'analyzeObject') {
        await this.analyzeObject(String(message.id || ''));
      } else if (message?.command === 'refresh') {
        await this.render();
      }
    });
    await this.render();
  }

  public async refresh(): Promise<void> {
    await this.render();
  }

  private async analyzeObject(objectId: string): Promise<void> {
    const projectPath = this.projectPathProvider();
    if (!projectPath || !objectId) return;
    const repository = new UnifiedFileSystemObjectRepository(projectPath);
    const object = await repository.getObject(`object://${objectId}`);
    if (!object) return;
    const name = await vscode.window.showInputBox({
      title: 'Analyze object — name',
      prompt: 'Correct the logical object name if required.',
      value: object.name,
    });
    if (name === undefined) return;
    const css = await vscode.window.showInputBox({
      title: 'Analyze object — Playwright CSS',
      prompt: 'Optional CSS locator. Leave unchanged to keep the current locator.',
      value: object.pw?.css || '',
    });
    if (css === undefined) return;
    const ocr = await vscode.window.showInputBox({
      title: 'Analyze object — Surface OCR',
      prompt: 'Optional OCR text. Leave unchanged to keep the current evidence.',
      value: String(object.surface?.find((locator) => locator.strategy === 'ocr')?.value || ''),
    });
    if (ocr === undefined) return;
    const next = {
      ...object,
      name: name.trim() || object.name,
      pw: css.trim() ? { ...(object.pw || {}), css: css.trim() } : object.pw,
      surface: ocr.trim() ? [...(object.surface || []).filter((locator) => locator.strategy !== 'ocr'), { strategy: 'ocr' as const, value: ocr.trim(), priority: 10 }] : object.surface,
    };
    await repository.save(next, 'Automation Studio Object Analyzer', 'Manual correction from Object Repository');
    this.selectedId = object.id;
    await this.render();
    void vscode.window.showInformationMessage(`Updated ${object.id}`);
  }

  private async render(): Promise<void> {
    if (!this.view) return;
    const projectPath = this.projectPathProvider();
    const objects = projectPath ? await this.loadObjects(projectPath) : [];
    if (!this.selectedId || !objects.some((object) => object.id === this.selectedId)) this.selectedId = objects[0]?.id;
    this.view.webview.html = this.getHtml(objects, this.selectedId);
  }

  private async loadObjects(projectPath: string): Promise<ObjectPreview[]> {
    const repository = new UnifiedFileSystemObjectRepository(projectPath);
    const objects: ObjectPreview[] = [];
    for (const uri of await repository.list()) {
      const object = await repository.getObject(uri);
      if (!object) continue;
      const preview: ObjectPreview = { ...object };
      if (object.screenshot?.dataUrl) preview.screenshotDataUrl = object.screenshot.dataUrl;
      else if (object.screenshot?.path) preview.screenshotDataUrl = await this.readImage(projectPath, object.screenshot.path);
      objects.push(preview);
    }
    return objects;
  }

  private async readImage(projectPath: string, imagePath: string): Promise<string | undefined> {
    const root = path.resolve(projectPath);
    const resolved = path.resolve(projectPath, imagePath);
    if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) return undefined;
    try {
      const bytes = await fs.readFile(resolved);
      const ext = path.extname(resolved).toLowerCase();
      const mime = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : ext === '.webp' ? 'image/webp' : 'image/png';
      return `data:${mime};base64,${bytes.toString('base64')}`;
    } catch {
      return undefined;
    }
  }

  private escape(value: unknown): string {
    return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }

  private getHtml(objects: ObjectPreview[], selectedId?: string): string {
    const groups = new Map<string, ObjectPreview[]>();
    for (const object of objects) {
      const group = object.id.split('.')[0] || 'objects';
      const list = groups.get(group) || [];
      list.push(object);
      groups.set(group, list);
    }
    const tree = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([group, entries]) => `
      <div class="group"><div class="group-title">${this.escape(group)} <span>${entries.length}</span></div>
      ${entries.sort((a, b) => a.id.localeCompare(b.id)).map((object) => `<button class="object ${object.id === selectedId ? 'selected' : ''}" data-object-id="${this.escape(object.id)}"><span class="object-icon">${this.escape(object.type.slice(0, 1).toUpperCase())}</span><span class="object-label"><strong>${this.escape(object.name)}</strong><small>${this.escape(object.id)} · v${object.version}</small></span></button>`).join('')}</div>`).join('');
    const selected = objects.find((object) => object.id === selectedId);
    const pw = selected?.pw ? Object.entries(selected.pw).map(([key, value]) => `<div class="kv"><span>PW ${this.escape(key)}</span><code>${this.escape(value)}</code></div>`).join('') : '';
    const surface = selected?.surface?.map((locator) => `<div class="kv"><span>Surface ${this.escape(locator.strategy)}</span><code>${this.escape(locator.value)}</code></div>`).join('') || '';
    const metadata = selected?.captureMetadata ? `<div class="kv"><span>Capture size</span><code>${selected.captureMetadata.captureSize.width} × ${selected.captureMetadata.captureSize.height}</code></div>` : '';
    const details = selected ? `<div class="preview">${selected.screenshotDataUrl ? `<img src="${selected.screenshotDataUrl}" alt="${this.escape(selected.name)}">` : '<div class="empty-image">No screenshot attached</div>'}</div><div class="detail-title"><h3>${this.escape(selected.name)}</h3><button class="analyze" onclick="vscode.postMessage({command:'analyzeObject',id:'${this.escape(selected.id)}'})">Analyze / correct</button></div><div class="uri">object://${this.escape(selected.id)}</div><div class="chips"><span>${this.escape(selected.type)}</span><span>Version ${selected.version}</span></div><div class="details-section"><div class="section-title">Locators</div>${pw || surface || '<div class="muted">No locators saved</div>'}</div><div class="details-section"><div class="section-title">Details</div>${metadata}<div class="kv"><span>Description</span><code>${this.escape(selected.description || '—')}</code></div><div class="kv"><span>Updated</span><code>${new Date(selected.updatedAt).toLocaleString()}</code></div></div>` : '<div class="empty-detail">Select an object from the tree.</div>';
    return `<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
      :root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;color:var(--vscode-foreground);background:var(--vscode-sideBar-background);font:12px var(--vscode-font-family)}.repo{display:grid;grid-template-columns:42% 58%;height:100vh;min-height:420px}.tree{border-right:1px solid var(--vscode-panel-border);overflow:auto;padding:8px}.tree-head,.group-title{display:flex;align-items:center;justify-content:space-between;color:var(--vscode-descriptionForeground);font-size:10px;text-transform:uppercase;letter-spacing:.7px}.tree-head{padding:4px 4px 10px;font-weight:700}.refresh{border:0;background:transparent;color:var(--vscode-descriptionForeground);cursor:pointer}.group{margin:7px 0}.group-title{padding:4px}.object{display:flex;gap:7px;width:100%;padding:7px 5px;border:0;border-radius:4px;text-align:left;color:inherit;background:transparent;cursor:pointer}.object:hover,.object.selected{background:var(--vscode-list-activeSelectionBackground);color:var(--vscode-list-activeSelectionForeground)}.object-icon{display:grid;place-items:center;flex:0 0 20px;height:20px;border:1px solid var(--vscode-textLink-foreground);border-radius:4px;color:var(--vscode-textLink-foreground);font-size:10px}.object-label{min-width:0;display:grid}.object-label strong,.object-label small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.object-label small,.muted,.uri{color:var(--vscode-descriptionForeground);font-size:10px}.details{overflow:auto;padding:12px}.preview{display:grid;place-items:center;min-height:105px;max-height:210px;margin-bottom:12px;border:1px dashed var(--vscode-panel-border);background:var(--vscode-editor-background);overflow:hidden}.preview img{display:block;max-width:100%;max-height:205px}.empty-image,.empty-detail{padding:30px 8px;text-align:center;color:var(--vscode-descriptionForeground)}.detail-title{display:flex;align-items:center;justify-content:space-between;gap:8px}h3{margin:0 0 3px;font-size:14px}.analyze{padding:4px 7px;border:1px solid var(--vscode-textLink-foreground);border-radius:4px;color:var(--vscode-textLink-foreground);background:transparent;cursor:pointer}.uri{word-break:break-all}.chips{display:flex;gap:5px;margin:9px 0}.chips span{padding:3px 6px;border-radius:10px;background:var(--vscode-badge-background);color:var(--vscode-badge-foreground);font-size:10px}.details-section{margin-top:14px;border-top:1px solid var(--vscode-panel-border);padding-top:10px}.section-title{margin-bottom:7px;color:var(--vscode-descriptionForeground);font-size:10px;text-transform:uppercase;letter-spacing:.7px}.kv{display:grid;grid-template-columns:42% 58%;gap:5px;padding:5px 0;border-bottom:1px solid color-mix(in srgb,var(--vscode-panel-border) 60%,transparent)}.kv span{color:var(--vscode-descriptionForeground)}code{overflow-wrap:anywhere;color:var(--vscode-editor-foreground);font:10px var(--vscode-editor-font-family)}</style></head><body><div class="repo"><aside class="tree"><div class="tree-head">Objects <button class="refresh" title="Refresh" onclick="vscode.postMessage({command:'refresh'})">↻</button></div>${tree || '<div class="empty-detail">No objects yet.<br>Save a flow or control to create one.</div>'}</aside><main class="details">${details}</main></div><script>const vscode=acquireVsCodeApi();document.querySelectorAll('[data-object-id]').forEach(item=>item.addEventListener('click',()=>vscode.postMessage({command:'selectObject',id:item.dataset.objectId})));</script></body></html>`;
  }
}
