/**
 * Event factory - creates properly structured IEvent instances.
 */

import type { IEvent, UUID, Timestamp, CorrelationId } from '@automation-studio/types';
import { generateUUID } from '@automation-studio/shared';

export function createEvent<T>(
  type: string,
  payload: T,
  options?: {
    correlationId?: CorrelationId;
    source?: string;
  },
): IEvent<T> {
  return {
    id: generateUUID(),
    type,
    timestamp: Date.now() as Timestamp,
    correlationId: (options?.correlationId ?? generateUUID()) as CorrelationId,
    source: options?.source ?? 'automation-studio',
    payload,
  };
}

export function createCorrelatedEvent<T>(
  type: string,
  payload: T,
  parentEvent: IEvent<unknown>,
  source?: string,
): IEvent<T> {
  return {
    id: generateUUID() as UUID,
    type,
    timestamp: Date.now() as Timestamp,
    correlationId: parentEvent.correlationId,
    source: source ?? parentEvent.source,
    payload,
  };
}
