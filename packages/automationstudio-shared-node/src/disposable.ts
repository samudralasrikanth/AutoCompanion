/**
 * Disposable utilities for resource management.
 */

import type { IDisposable } from '@automation-studio/types';

export function toDisposable(fn: () => void): IDisposable {
  let disposed = false;
  return {
    dispose(): void {
      if (!disposed) {
        disposed = true;
        fn();
      }
    },
  };
}

export class DisposableStore implements IDisposable {
  private readonly items: IDisposable[] = [];
  private disposed = false;

  public add<T extends IDisposable>(disposable: T): T {
    if (this.disposed) {
      disposable.dispose();
      return disposable;
    }
    this.items.push(disposable);
    return disposable;
  }

  public dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;

    const toDispose = [...this.items].reverse();
    this.items.length = 0;
    for (const item of toDispose) {
      try {
        item.dispose();
      } catch {
        // Swallow disposal errors
      }
    }
  }

  public get isDisposed(): boolean {
    return this.disposed;
  }

  public get size(): number {
    return this.items.length;
  }
}

export class MutableDisposable<T extends IDisposable> implements IDisposable {
  private current: T | undefined;
  private disposed = false;

  public get value(): T | undefined {
    return this.current;
  }

  public set value(newValue: T | undefined) {
    if (this.disposed) {
      newValue?.dispose();
      return;
    }
    this.current?.dispose();
    this.current = newValue;
  }

  public dispose(): void {
    if (!this.disposed) {
      this.disposed = true;
      this.current?.dispose();
      this.current = undefined;
    }
  }
}
