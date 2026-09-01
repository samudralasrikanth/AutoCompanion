import type { IInspector, InspectSession, InspectResult } from '@automation-studio/inspector';
import type { Browser, Page, BrowserContext } from 'playwright-core';
import { readFileSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { chromiumLaunchOptions } from '../browser-launcher';

class PlaywrightInspectSession implements InspectSession {
  public sessionId: string;
  private browser: Browser;
  private context: BrowserContext;
  private page: Page;
  private onSelectCallback?: (result: InspectResult) => void;
  private onDisconnectCallback?: () => void;
  private isPaused = false;
  private isStopped = false;

  constructor(browser: Browser, context: BrowserContext, page: Page) {
    this.sessionId = randomUUID();
    this.browser = browser;
    this.context = context;
    this.page = page;
  }

  public async start(): Promise<void> {
    const injectOverlay = async (p: Page) => {
      // Expose the callback function to the browser window
      await p.exposeFunction('__automation_studio_element_selected', (data: any) => {
        if (this.isPaused || this.isStopped) return;
        if (this.onSelectCallback) {
          this.onSelectCallback({
            locatorCandidates: data.locators,
            metadata: data.metadata,
            sourceUrl: p.url(),
            timestamp: Date.now()
          });
        }
      }).catch(() => {}); // ignore if already exposed

      // Inject the overlay script
      const scriptPath = join(__dirname, 'inspector-overlay.js');
      try {
        const scriptContent = readFileSync(scriptPath, 'utf8');
        await p.addInitScript(scriptContent);
        // Also inject into current page if it's already loaded
        await p.evaluate(scriptContent).catch(() => {});
      } catch (e) {
        console.warn('Failed to inject inspector overlay.');
      }
    };

    // Inject into current page
    await injectOverlay(this.page);

    // Multi-tab support: inject into new pages
    this.context.on('page', async (newPage) => {
      await injectOverlay(newPage);
      // Track latest page
      this.page = newPage;
      newPage.on('crash', () => {
        if (this.onDisconnectCallback) this.onDisconnectCallback();
      });
    });

    this.browser.on('disconnected', () => {
      this.isStopped = true;
      if (this.onDisconnectCallback) this.onDisconnectCallback();
    });
  }

  public async stop(): Promise<void> {
    this.isStopped = true;
    await this.browser.close().catch(() => {});
  }

  public async pause(): Promise<void> {
    this.isPaused = true;
  }

  public async resume(): Promise<void> {
    this.isPaused = false;
  }

  public async refresh(): Promise<void> {
    await this.page.reload().catch(() => {});
  }

  public async switchBrowser(browserType: string): Promise<void> {
    // Requires tearing down and recreating session. Kept as stub for now.
  }

  public async exportDom(): Promise<string> {
    try {
      return await this.page.content();
    } catch (e) {
      return '<html><body>Failed to export DOM</body></html>';
    }
  }

  public onElementSelected(callback: (result: InspectResult) => void): void {
    this.onSelectCallback = callback;
  }

  public onDisconnected(callback: () => void): void {
    this.onDisconnectCallback = callback;
  }

  public async highlight(locatorStrategy: string, locatorValue: string): Promise<void> {
    await this.page.evaluate(({ strategy, value }) => {
      // Very basic highlight implementation
      const el = document.querySelector(value);
      if (el) {
        (el as HTMLElement).style.outline = '3px solid red';
      }
    }, { strategy: locatorStrategy, value: locatorValue }).catch(() => {});
  }

  public async clearHighlight(): Promise<void> {
    await this.page.evaluate(() => {
      // Clear highlight logic here
    }).catch(() => {});
  }
}

export class PlaywrightInspector implements IInspector {
  public name = 'Playwright Inspector';

  public async createSession(target?: any): Promise<InspectSession> {
    // Playwright must stay lazy: importing it during VS Code activation touches
    // the extension host's guarded navigator global and can abort activation.
    const { chromium } = require('playwright-core') as typeof import('playwright-core');
    const browser = await chromium.launch(chromiumLaunchOptions({ chromium }));
    const context = await browser.newContext();
    const page = await context.newPage();
    
    const session = new PlaywrightInspectSession(browser, context, page);
    await session.start();
    return session;
  }
}
