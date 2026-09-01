import { RawRecorderEvent } from './raw_event';

export interface EventCorrelationContext {
  sessionId: string;
  executionId?: string;
  correlationId?: string;
}

/**
 * Attaches correlation context to raw platform events.
 */
export class EventCorrelator {
  constructor(private context: EventCorrelationContext) {}

  /**
   * Applies the current correlation context to an incoming event payload.
   */
  correlate(event: Omit<RawRecorderEvent, 'sessionId' | 'executionId' | 'correlationId'>): RawRecorderEvent {
    return {
      ...event,
      sessionId: this.context.sessionId,
      executionId: this.context.executionId,
      correlationId: this.context.correlationId,
    };
  }

  updateContext(newContext: Partial<EventCorrelationContext>): void {
    this.context = {
      ...this.context,
      ...newContext
    };
  }
}
