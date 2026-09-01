/**
 * Cancellation token for cooperative task cancellation.
 */

import type { IDisposable } from '@automation-studio/types';

export class CancellationToken {
  private cancelled = false;
  private readonly listeners: Array<() => void> = [];

  public get isCancellationRequested(): boolean {
    return this.cancelled;
  }

  public onCancellationRequested(listener: () => void): IDisposable {
    if (this.cancelled) {
      listener();
      return { dispose: () => {} };
    }

    this.listeners.push(listener);
    return {
      dispose: (): void => {
        const idx = this.listeners.indexOf(listener);
        if (idx >= 0) {
          this.listeners.splice(idx, 1);
        }
      },
    };
  }

  public throwIfCancellationRequested(): void {
    if (this.cancelled) {
      throw new Error('Operation was cancelled');
    }
  }

  /** @internal */
  public cancel(): void {
    if (this.cancelled) {
      return;
    }
    this.cancelled = true;
    for (const listener of this.listeners) {
      try {
        listener();
      } catch {
        // Swallow listener errors
      }
    }
    this.listeners.length = 0;
  }
}

export class CancellationTokenSource implements IDisposable {
  public readonly token: CancellationToken;

  constructor() {
    this.token = new CancellationToken();
  }

  public cancel(): void {
    this.token.cancel();
  }

  public dispose(): void {
    this.cancel();
  }
}
