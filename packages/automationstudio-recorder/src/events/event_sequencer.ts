import { RawRecorderEvent } from './raw_event';

/**
 * Ensures strict monotonic sequencing for ingested events.
 * The sequence number guarantees deterministic ordering based on arrival at the recorder boundary.
 */
export class EventSequencer {
  private currentSequence = 0;

  /**
   * Applies the next sequence number to an incoming event payload.
   */
  sequence(event: Omit<RawRecorderEvent, 'sequenceNumber'>): RawRecorderEvent {
    this.currentSequence += 1;
    return {
      ...event,
      sequenceNumber: this.currentSequence,
    } as RawRecorderEvent;
  }

  reset(): void {
    this.currentSequence = 0;
  }
}
