/**
 * Event Bus implementation.
 * Strongly-typed publish/subscribe with replay, history, and error isolation.
 */

import type {
  IEventBus,
  IEvent,
  IEventSubscription,
  EventHandler,
  EventBusOptions,
  UUID,
} from '@automation-studio/types';
import { generateUUID } from '@automation-studio/shared';

interface SubscriptionEntry {
  readonly id: UUID;
  readonly eventType: string;
  readonly handler: EventHandler;
  readonly once: boolean;
  active: boolean;
}

const DEFAULT_MAX_HISTORY = 100;

export class EventBus implements IEventBus {
  private readonly subscriptions: Map<string, SubscriptionEntry[]> = new Map();
  private readonly history: Map<string, IEvent[]> = new Map();
  private readonly maxHistorySize: number;
  private readonly enableReplay: boolean;
  private disposed = false;

  constructor(options?: EventBusOptions) {
    this.maxHistorySize = options?.maxHistorySize ?? DEFAULT_MAX_HISTORY;
    this.enableReplay = options?.enableReplay ?? true;
  }

  public publish<T>(event: IEvent<T>): void {
    this.ensureNotDisposed();

    // Store in history
    if (this.enableReplay) {
      this.addToHistory(event);
    }

    const subs = this.subscriptions.get(event.type);
    if (!subs) {
      return;
    }

    const toRemove: SubscriptionEntry[] = [];

    for (const sub of subs) {
      if (!sub.active) {
        continue;
      }

      try {
        const result = sub.handler(event);
        // Handle async handlers - fire and forget with error catch
        if (result instanceof Promise) {
          result.catch(() => {
            // Error in async handler - isolated, doesn't affect other handlers
          });
        }
      } catch {
        // Error in sync handler - isolated, doesn't affect other handlers
      }

      if (sub.once) {
        sub.active = false;
        toRemove.push(sub);
      }
    }

    // Clean up one-time subscriptions
    if (toRemove.length > 0) {
      const remaining = subs.filter((s) => !toRemove.includes(s));
      this.subscriptions.set(event.type, remaining);
    }
  }

  public subscribe<T>(eventType: string, handler: EventHandler<T>): IEventSubscription {
    this.ensureNotDisposed();
    return this.addSubscription(eventType, handler as EventHandler, false);
  }

  public once<T>(eventType: string, handler: EventHandler<T>): IEventSubscription {
    this.ensureNotDisposed();
    return this.addSubscription(eventType, handler as EventHandler, true);
  }

  public unsubscribe(subscription: IEventSubscription): void {
    const subs = this.subscriptions.get(subscription.eventType);
    if (!subs) {
      return;
    }

    const idx = subs.findIndex((s) => s.id === subscription.id);
    if (idx !== -1) {
      const entry = subs[idx];
      if (entry) {
        entry.active = false;
      }
      subs.splice(idx, 1);
    }
  }

  public replay(eventType: string, count?: number): ReadonlyArray<IEvent> {
    const history = this.history.get(eventType) ?? [];
    if (count !== undefined) {
      return history.slice(-count);
    }
    return [...history];
  }

  public get historySize(): number {
    let total = 0;
    for (const events of this.history.values()) {
      total += events.length;
    }
    return total;
  }

  public clear(): void {
    this.subscriptions.clear();
    this.history.clear();
  }

  public dispose(): void {
    this.disposed = true;
    this.clear();
  }

  private addSubscription(
    eventType: string,
    handler: EventHandler,
    once: boolean,
  ): IEventSubscription {
    const id = generateUUID();

    const entry: SubscriptionEntry = {
      id,
      eventType,
      handler,
      once,
      active: true,
    };

    if (!this.subscriptions.has(eventType)) {
      this.subscriptions.set(eventType, []);
    }

    const subs = this.subscriptions.get(eventType);
    if (subs) {
      subs.push(entry);
    }

    return {
      id,
      eventType,
      get isActive(): boolean {
        return entry.active;
      },
      dispose: (): void => {
        entry.active = false;
        this.unsubscribe({ id, eventType, isActive: false, dispose: () => {} });
      },
    };
  }

  private addToHistory(event: IEvent): void {
    if (!this.history.has(event.type)) {
      this.history.set(event.type, []);
    }

    const events = this.history.get(event.type);
    if (events) {
      events.push(event);
      while (events.length > this.maxHistorySize) {
        events.shift();
      }
    }
  }

  private ensureNotDisposed(): void {
    if (this.disposed) {
      throw new Error('EventBus has been disposed');
    }
  }
}
