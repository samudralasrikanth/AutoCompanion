import type { RawEvent, PipelineNormalizedEvent, PipelineResult } from '@automation-studio/recorder';

export class EventNormalizer {
  public normalize(event: RawEvent): PipelineResult<PipelineNormalizedEvent> {
    try {
      const normalizedEvent: PipelineNormalizedEvent = {
        ...event,
        normalizedX: event.x !== undefined ? event.x : undefined, // Apply DPI scaling here if needed
        normalizedY: event.y !== undefined ? event.y : undefined,
      };

      return {
        data: normalizedEvent,
        errors: [],
        warnings: []
      };
    } catch (e: any) {
      return {
        errors: [`Normalization failed: ${e.message}`],
        warnings: []
      };
    }
  }
}
