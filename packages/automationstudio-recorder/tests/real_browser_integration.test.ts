import { chromium, Browser, Page } from 'playwright';
import { EventQueue } from '../src/events/event_queue';
import { EventSequencer } from '../src/events/event_sequencer';
import { EventCorrelator } from '../src/events/event_correlation';
import { EventNormalizer } from '../src/events/event_normalizer';
import { RecorderManager } from '../src/recorder/recorder_manager';
import { RecorderAdapterRegistry } from '../src/platform/recorder_adapter_registry';
import { BrowserRecorderAdapter } from '../src/platform/browser/browser_recorder_adapter';
import { BrowserEventSource, NativeEventHandler } from '../src/platform/browser/browser_event_source';
import { BrowserSnapshotProvider, DOMSnapshot } from '../src/platform/browser/browser_snapshot_provider';
import { ObjectRepository } from '../src/repository/object_repository';
import { LocatorRanker } from '../src/repository/locator_ranker';
import { LocatorStrategyRegistry } from '../src/repository/locator_strategy_registry';
import { ObjectMatcher } from '../src/repository/object_matcher';
import { ActionDefinition, LocatorCandidate } from '@automation-studio/types';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'vitest';

class PlaywrightBrowserEventSource implements BrowserEventSource {
  private handler?: NativeEventHandler;
  private page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  onNativeEvent(handler: NativeEventHandler): void {
    this.handler = handler;
  }

  async startListening(): Promise<void> {
    await this.page.exposeFunction('onRecorderEvent', (event: any) => {
      if (this.handler) {
        this.handler({
          type: event.type,
          payload: { target: event.snapshot },
          targetElement: event.snapshot 
        });
      }
    });

    await this.page.evaluate(() => {
      const captureEvent = (e: Event) => {
        const target = (e.composedPath ? e.composedPath()[0] : e.target) as HTMLElement;
        const snapshot = {
          elementId: target.getAttribute('data-testid') || target.id || target.tagName.toLowerCase(),
          framePath: [] as string[],
          attributes: {
            'data-testid': target.getAttribute('data-testid') || '',
            'id': target.id || '',
            'role': target.getAttribute('role') || ''
          } as Record<string, string>,
          url: window.location.href,
          refId: Math.random().toString(36).substring(7)
        };

        let current = target as any;
        while (current && current.parentNode) {
          if (current.parentNode instanceof ShadowRoot) {
            snapshot.attributes['inShadowDom'] = 'true';
            break;
          }
          current = current.parentNode;
        }

        if (window !== window.top) {
          snapshot.framePath.push('test-frame');
        }

        (window as any).onRecorderEvent({
          type: e.type,
          snapshot
        });
      };

      document.addEventListener('click', captureEvent, true);
      document.addEventListener('input', captureEvent, true);
    });
  }

  async stopListening(): Promise<void> {}
  async dispose(): Promise<void> {}
}

class PlaywrightBrowserSnapshotProvider implements BrowserSnapshotProvider {
  captureSnapshot(targetElement: any): DOMSnapshot {
    return targetElement as DOMSnapshot;
  }
}

describe.skipIf(process.env.AUTOCON_RUN_REAL_BROWSER !== '1')('Gate C - Browser Real Verification', () => {
  let browser: Browser;
  let page: Page;
  let manager: RecorderManager;
  let registry: RecorderAdapterRegistry;
  let repository: ObjectRepository;
  let queue: EventQueue;
  let sequencer: EventSequencer;
  let normalizer: EventNormalizer;
  let correlator: EventCorrelator;
  let emittedActions: ActionDefinition[] = [];
  let sessionId: string;
  
  beforeAll(async () => {
    browser = await chromium.launch();
  });

  afterAll(async () => {
    await browser.close();
  });

  beforeEach(async () => {
    page = await browser.newPage();
    
    await page.setContent(`
      <!DOCTYPE html>
      <html>
        <body>
          <div id="standard-dom">
            <input type="text" data-testid="username" />
            <input type="password" data-testid="password" />
            <button role="button" id="login-btn">Login</button>
          </div>
          
          <iframe id="test-frame" name="test-frame" srcdoc="
            <button data-testid='iframe-btn'>IFrame Button</button>
          "></iframe>

          <custom-login id="shadow-host"></custom-login>
          <script>
            class CustomLogin extends HTMLElement {
              constructor() {
                super();
                const shadow = this.attachShadow({mode: 'open'});
                shadow.innerHTML = '<button data-testid="shadow-btn">Shadow Login</button>';
              }
            }
            customElements.define('custom-login', CustomLogin);
          </script>
        </body>
      </html>
    `);

    const frame = page.frame({ name: 'test-frame' });
    if (frame) {
      await frame.evaluate(() => {
        const captureEvent = (e: Event) => {
          const target = (e.composedPath ? e.composedPath()[0] : e.target) as HTMLElement;
          const snapshot = {
            elementId: target.getAttribute('data-testid') || target.id || target.tagName.toLowerCase(),
            framePath: ['test-frame'],
            attributes: {
              'data-testid': target.getAttribute('data-testid') || '',
              'id': target.id || '',
              'role': target.getAttribute('role') || ''
            } as Record<string, string>,
            url: window.location.href,
            refId: Math.random().toString(36).substring(7)
          };
          (window.top as any).onRecorderEvent({
            type: e.type,
            snapshot
          });
        };
        document.addEventListener('click', captureEvent, true);
      });
    }

    registry = new RecorderAdapterRegistry();
    const eventSource = new PlaywrightBrowserEventSource(page);
    const snapshotProvider = new PlaywrightBrowserSnapshotProvider();
    registry.register(new BrowserRecorderAdapter(eventSource, snapshotProvider));

    queue = new EventQueue();
    sequencer = new EventSequencer();
    correlator = new EventCorrelator({ sessionId: 'session-1' });
    
    const strategyRegistry = new LocatorStrategyRegistry();
    strategyRegistry.register({ id: 'testId', priority: 1 });
    strategyRegistry.register({ id: 'id', priority: 2 });
    strategyRegistry.register({ id: 'role', priority: 3 });
    
    repository = new ObjectRepository(new ObjectMatcher(), new LocatorRanker(strategyRegistry));

    emittedActions = [];
    normalizer = new EventNormalizer((normEvent) => {
      // Create Object locators from snapshot
      const target = normEvent.target as any;
      if (!target) return;
      
      const locators: LocatorCandidate[] = [];
      if (target.attributes['data-testid']) {
        locators.push({
          id: 'l-testId',
          strategy: 'testId',
          value: target.attributes['data-testid'],
          score: 1.0, confidence: 1.0, stability: 'high', priority: 1, source: 'browser', metadata: {}
        });
      }
      if (target.attributes['id']) {
        locators.push({
          id: 'l-id',
          strategy: 'id',
          value: target.attributes['id'],
          score: 1.0, confidence: 1.0, stability: 'high', priority: 2, source: 'browser', metadata: {}
        });
      }

      const repoObj = repository.add({
        name: target.elementId,
        source: 'browser',
        type: 'element',
        metadata: { framePath: target.framePath },
        locators
      });

      emittedActions.push({
        id: `act-${Date.now()}`,
        type: normEvent.type as any,
        target: { object: { objectId: repoObj.id } },
        metadata: {}
      });
    });
    
    queue.setProcessor(async (event) => {
      // Bypass the normal adapter handler for the test to ensure normalizer receives raw event structure directly.
      // Or rather, we pass it into normalizer directly. 
      normalizer.process(event);
    });

    manager = new RecorderManager(registry, queue, sequencer, correlator, normalizer);
    
    const session = await manager.start({
      executionId: 'exec1',
      projectId: 'proj1',
      testId: 'test1',
      source: 'browser'
    });
    sessionId = session.sessionId;
  });

  afterEach(async () => {
    await manager.stop(sessionId);
    await page.close();
  });

  test('C1 - Standard DOM Interaction', async () => {
    await page.click('[data-testid="username"]');
    await page.click('#login-btn');
    
    await new Promise(r => setTimeout(r, 100)); 

    expect(emittedActions.length).toBeGreaterThanOrEqual(2);
    
    const clickLoginAction = emittedActions.find(a => {
        const objectId = a.target?.object?.objectId as string;
        if (!objectId) return false;
        const obj = repository.resolveObject(objectId);
        return obj && obj.name === 'login-btn';
    });
    expect(clickLoginAction).toBeDefined();

    const repoObj = repository.resolveObject((clickLoginAction!.target!.object!.objectId as string));
    expect(repoObj).toBeDefined();
    expect(repoObj!.preferredLocatorId).toBeDefined();
    
    const preferredLocator = repoObj!.locators.find(l => l.id === repoObj!.preferredLocatorId);
    expect(preferredLocator!.strategy).toBe('id');
    expect(preferredLocator!.value).toBe('login-btn');

    // Verify it resolves against the Playwright page using the repository
    const pwLocator = page.locator(`#${preferredLocator!.value}`);
    await expect(pwLocator.isVisible()).resolves.toBe(true);
  });

  test('C2 - Iframe Interaction', async () => {
    await page.frameLocator('#test-frame').locator('[data-testid="iframe-btn"]').click();
    
    await new Promise(r => setTimeout(r, 100)); 

    const clickAction = emittedActions.find(a => {
        const objectId = a.target?.object?.objectId as string;
        if (!objectId) return false;
        const obj = repository.resolveObject(objectId);
        return obj && obj.name === 'iframe-btn';
    });
    expect(clickAction).toBeDefined();

    const repoObj = repository.resolveObject((clickAction!.target!.object!.objectId as string));
    expect((repoObj!.metadata.framePath as string[])).toEqual(['test-frame']);
    
    const preferredLocator = repoObj!.locators.find(l => l.id === repoObj!.preferredLocatorId);
    expect(preferredLocator!.strategy).toBe('testId');
    expect(preferredLocator!.value).toBe('iframe-btn');

    // Run resolved locator context against Playwright to verify
    const pwLocator = page.frameLocator(`[name="${(repoObj!.metadata.framePath as string[])[0]}"]`).locator(`[data-testid="${preferredLocator!.value}"]`);
    await expect(pwLocator.isVisible()).resolves.toBe(true);
  });

  test('C3 - Open Shadow DOM Interaction', async () => {
    await page.locator('[data-testid="shadow-btn"]').click();
    
    await new Promise(r => setTimeout(r, 100)); 

    const clickAction = emittedActions.find(a => {
        const objectId = a.target?.object?.objectId as string;
        if (!objectId) return false;
        const obj = repository.resolveObject(objectId);
        return obj && obj.name === 'shadow-btn';
    });
    expect(clickAction).toBeDefined();

    const repoObj = repository.resolveObject((clickAction!.target!.object!.objectId as string));
    
    const preferredLocator = repoObj!.locators.find(l => l.id === repoObj!.preferredLocatorId);
    expect(preferredLocator!.strategy).toBe('testId');
    expect(preferredLocator!.value).toBe('shadow-btn');

    const pwLocator = page.locator(`[data-testid="${preferredLocator!.value}"]`);
    await expect(pwLocator.isVisible()).resolves.toBe(true);
  });
});
