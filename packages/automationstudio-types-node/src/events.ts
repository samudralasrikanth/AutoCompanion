/**
 * Event system types.
 * Defines the strongly-typed event bus contract with publish, subscribe, replay.
 */

import type { UUID, Timestamp, CorrelationId } from './common';
import type { IDisposable } from './di';

// ─── Event ───────────────────────────────────────────────────────────────────

export interface IEvent<T = unknown> {
  readonly id: UUID;
  readonly type: string;
  readonly timestamp: Timestamp;
  readonly correlationId: CorrelationId;
  readonly source: string;
  readonly payload: T;
}

// ─── Event Handler ───────────────────────────────────────────────────────────

export type EventHandler<T = unknown> = (event: IEvent<T>) => void | Promise<void>;

// ─── Event Subscription ─────────────────────────────────────────────────────

export interface IEventSubscription extends IDisposable {
  readonly id: UUID;
  readonly eventType: string;
  readonly isActive: boolean;
}

// ─── Event Bus ───────────────────────────────────────────────────────────────

export interface EventMetadata {
  timestamp: number;
  source: string;
  id?: string;
  executionId?: string;
  scenarioId?: string;
  stepId?: string;
  threadId?: string;
}

export interface IEventBus extends IDisposable {
  publish<T>(event: IEvent<T>): void;

  subscribe<T>(eventType: string, handler: EventHandler<T>): IEventSubscription;

  once<T>(eventType: string, handler: EventHandler<T>): IEventSubscription;

  unsubscribe(subscription: IEventSubscription): void;

  replay(eventType: string, count?: number): ReadonlyArray<IEvent>;

  readonly historySize: number;

  clear(): void;
}

// ─── Event Bus Options ───────────────────────────────────────────────────────

export interface EventBusOptions {
  readonly maxHistorySize?: number;
  readonly enableReplay?: boolean;
}
