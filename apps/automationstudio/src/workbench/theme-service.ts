import * as vscode from 'vscode';
import type { IDisposable, ILogger } from '@automation-studio/types';
import type { IThemeService, ThemeType } from './workbench-types';
import { toDisposable } from '@automation-studio/shared';

export class ThemeService implements IThemeService {
  private _currentTheme: ThemeType;
  private readonly listeners = new Set<(theme: ThemeType) => void>();
  private readonly disposable: vscode.Disposable;

  constructor(private readonly logger: ILogger) {
    this._currentTheme = this.resolveTheme(vscode.window.activeColorTheme.kind);
    
    this.disposable = vscode.window.onDidChangeActiveColorTheme((e) => {
      const newTheme = this.resolveTheme(e.kind);
      if (this._currentTheme !== newTheme) {
        this._currentTheme = newTheme;
        this.fireThemeChanged();
      }
    });
  }

  public get currentTheme(): ThemeType {
    return this._currentTheme;
  }

  public onChange(listener: (theme: ThemeType) => void): IDisposable {
    this.listeners.add(listener);
    return toDisposable(() => this.listeners.delete(listener));
  }

  private resolveTheme(kind: vscode.ColorThemeKind): ThemeType {
    switch (kind) {
      case vscode.ColorThemeKind.Light:
      case vscode.ColorThemeKind.HighContrastLight:
        return 'light';
      case vscode.ColorThemeKind.HighContrast:
        return 'hc';
      case vscode.ColorThemeKind.Dark:
      default:
        return 'dark';
    }
  }

  private fireThemeChanged(): void {
    const current = this.currentTheme;
    for (const listener of this.listeners) {
      try {
        listener(current);
      } catch (err) {
        this.logger.error('Error in ThemeService listener', err as Error);
      }
    }
  }

  public dispose(): void {
    this.disposable.dispose();
    this.listeners.clear();
  }
}
