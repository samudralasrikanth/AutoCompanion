import { BaseFramework } from '@automation-studio/sdk';
import type { IPluginContext } from '@automation-studio/types';
import { PlaywrightInspector } from './inspector/playwright-inspector';
import { PlaywrightRecorderPlugin } from './recorder/playwright-recorder';
export { chromiumLaunchOptions } from './browser-launcher';
export * from './recorder/playwright-recorder';

export default class PlaywrightPlugin extends BaseFramework {
  public inspector!: PlaywrightInspector;
  public recorder!: PlaywrightRecorderPlugin;

  constructor() {
    super('playwright', '0.1.0');
  }

  public async initialize(context?: IPluginContext): Promise<void> {
    if (context) {
      context.logger.info('Initializing Playwright Plugin...');
    }
    this.inspector = new PlaywrightInspector();
    this.recorder = new PlaywrightRecorderPlugin();
  }

  public async dispose(): Promise<void> {
    // cleanup browsers if running
  }
}
