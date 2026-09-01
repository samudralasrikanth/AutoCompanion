import * as vscode from 'vscode';
import type { ILogger, IDisposable } from '@automation-studio/types';
import type { IWebviewHost, IWebviewOptions, IWebviewPanel } from './workbench-types';
import { toDisposable } from '@automation-studio/shared';

class WebviewPanelWrapper implements IWebviewPanel {
  private readonly disposeListeners = new Set<() => void>();
  private _isDisposed = false;

  constructor(
    public readonly id: string,
    public readonly panel: vscode.WebviewPanel,
    private readonly hostLogger: ILogger
  ) {
    this.panel.onDidDispose(() => {
      this._isDisposed = true;
      for (const listener of this.disposeListeners) {
        try {
          listener();
        } catch (e) {
          this.hostLogger.error(`Error in Webview dispose listener for ${id}`, e as Error);
        }
      }
    });
  }

  public updateHtml(html: string): void {
    if (!this._isDisposed) {
      this.panel.webview.html = html;
    }
  }

  public onDidDispose(listener: () => void): IDisposable {
    this.disposeListeners.add(listener);
    return toDisposable(() => this.disposeListeners.delete(listener));
  }

  public onDidReceiveMessage(listener: (message: any) => void): IDisposable {
    const d = this.panel.webview.onDidReceiveMessage(listener);
    return toDisposable(() => d.dispose());
  }

  public async postMessage(message: any): Promise<boolean> {
    if (this._isDisposed) return false;
    return this.panel.webview.postMessage(message);
  }

  public reveal(viewColumn?: vscode.ViewColumn): void {
    if (!this._isDisposed) {
      this.panel.reveal(viewColumn);
    }
  }

  public dispose(): void {
    if (!this._isDisposed) {
      this.panel.dispose();
    }
  }
}

export class WebviewHost implements IWebviewHost {
  private readonly panels = new Map<string, WebviewPanelWrapper>();

  constructor(private readonly logger: ILogger) {}

  public createOrShow(options: IWebviewOptions): IWebviewPanel {
    let wrapper = this.panels.get(options.id);

    if (wrapper) {
      wrapper.reveal(options.viewColumn);
      return wrapper;
    }

    const panel = vscode.window.createWebviewPanel(
      options.id,
      options.title,
      options.viewColumn ?? vscode.ViewColumn.One,
      {
        enableScripts: options.enableScripts ?? true,
        localResourceRoots: options.localResourceRoots,
        retainContextWhenHidden: true,
      }
    );

    wrapper = new WebviewPanelWrapper(options.id, panel, this.logger);
    this.panels.set(options.id, wrapper);

    wrapper.onDidDispose(() => {
      this.panels.delete(options.id);
      this.logger.debug(`Webview closed: ${options.id}`);
    });

    this.logger.debug(`Webview created: ${options.id}`);
    return wrapper;
  }

  public getPanel(id: string): IWebviewPanel | undefined {
    return this.panels.get(id);
  }

  public disposeAll(): void {
    for (const panel of this.panels.values()) {
      panel.dispose();
    }
    this.panels.clear();
  }
}
