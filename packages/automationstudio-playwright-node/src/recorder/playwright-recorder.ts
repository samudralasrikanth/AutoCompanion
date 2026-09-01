import { IRecorderPlugin, RawEvent } from '@automation-studio/recorder';
import type { Browser, BrowserContext, Page } from 'playwright-core';
import { randomUUID } from 'crypto';
import { chromiumLaunchOptions } from '../browser-launcher';

export class PlaywrightRecorderPlugin implements IRecorderPlugin {
  public metadata = {
    id: 'playwright',
    displayName: 'Playwright Recorder',
    technology: 'web',
    supportsRecording: true,
    supportsPlayback: true,
    supportsOCR: false,
    supportsVision: false
  };

  private browser?: Browser;
  private context?: BrowserContext;
  private page?: Page;
  
  private eventCallbacks: ((event: RawEvent) => void)[] = [];
  private stateCallbacks: ((state: 'idle' | 'recording' | 'paused' | 'error') => void)[] = [];
  private state: 'idle' | 'recording' | 'paused' | 'error' = 'idle';

  public async initialize(): Promise<void> {
    // Initialization logic if any
  }

  public async start(): Promise<void> {
    if (this.state === 'recording') return;
    this.setState('recording');

    const { chromium } = require('playwright-core') as typeof import('playwright-core');
    this.browser = await chromium.launch(chromiumLaunchOptions({ chromium }));
    this.context = await this.browser.newContext();
    this.page = await this.context.newPage();

    await this.page.exposeFunction('onUserAction', (action: any) => {
      if (this.state !== 'recording') return;
      this.emitEvent({
        id: randomUUID(),
        type: action.type === 'click' ? 'mouse' : 'keyboard',
        action: action.type,
        x: action.type === 'click' ? 0 : undefined,
        y: action.type === 'click' ? 0 : undefined,
        key: action.type === 'input' ? 'input' : undefined,
        timestamp: Date.now(),
        metadata: {
          selector: action.selector,
          value: action.value,
          windowTitle: 'Web Page',
          processName: 'chromium'
        }
      });
    });

    await this.page.addInitScript(() => {
      document.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        const selector = target.id ? `#${target.id}` : target.tagName.toLowerCase();
        (window as any).onUserAction({ type: 'click', selector });
      }, true);
      
      document.addEventListener('input', (e) => {
        const target = e.target as HTMLInputElement;
        const selector = target.id ? `#${target.id}` : target.tagName.toLowerCase();
        (window as any).onUserAction({ type: 'input', selector, value: target.value });
      }, true);
    });
  }

  public async stop(): Promise<void> {
    if (this.state === 'idle') return;
    this.setState('idle');
    
    if (this.browser) {
      await this.browser.close();
      this.browser = undefined;
    }
  }

  public async pause(): Promise<void> {
    this.setState('paused');
  }

  public async resume(): Promise<void> {
    this.setState('recording');
  }

  public onEvent(callback: (event: RawEvent) => void): void {
    this.eventCallbacks.push(callback);
  }

  public onDisconnected(callback: () => void): void {
    if (this.browser) {
      this.browser.on('disconnected', () => {
        this.setState('idle');
        callback();
      });
    }
  }

  private emitEvent(event: RawEvent) {
    for (const cb of this.eventCallbacks) {
      cb(event);
    }
  }

  private setState(newState: 'idle' | 'recording' | 'paused' | 'error') {
    this.state = newState;
    for (const cb of this.stateCallbacks) {
      cb(newState);
    }
  }
}
