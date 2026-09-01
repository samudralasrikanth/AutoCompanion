import { TimeoutError } from '../errors';

export type WaitStrategy = 'polling' | 'exponential' | 'fixed';

export interface WaitOptions {
  timeoutMs: number;
  intervalMs?: number;
  strategy?: WaitStrategy;
  message?: string;
}

export class WaitEngine {
  public async waitUntil(condition: () => Promise<boolean> | boolean, options: WaitOptions): Promise<void> {
    const timeout = options.timeoutMs;
    const interval = options.intervalMs || 500;
    const start = Date.now();
    let attempt = 0;

    while (Date.now() - start < timeout) {
      const result = await condition();
      if (result) {
        return;
      }

      attempt++;
      let waitTime = interval;
      if (options.strategy === 'exponential') {
        waitTime = Math.min(interval * Math.pow(2, attempt), 5000);
      }

      await this.sleep(waitTime);
    }

    throw new TimeoutError(options.message || `Timeout after ${timeout}ms waiting for condition.`);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
