import type { PipelineNormalizedEvent, ValidatedEvent, PipelineResult } from '@automation-studio/recorder';

export class EventValidator {
  public validate(event: PipelineNormalizedEvent): PipelineResult<ValidatedEvent> {
    const warnings: string[] = [];
    const errors: string[] = [];

    let isValid = true;
    let reason: string | undefined;

    if (event.type === 'mouse' && (event.normalizedX === undefined || event.normalizedY === undefined)) {
      isValid = false;
      reason = 'Missing coordinates for mouse event';
      errors.push(reason);
    }

    if (event.type === 'keyboard' && !event.key) {
      isValid = false;
      reason = 'Missing key for keyboard event';
      errors.push(reason);
    }

    const validatedEvent: ValidatedEvent = {
      ...event,
      isValid,
      validationReason: reason
    };

    return {
      data: validatedEvent,
      errors,
      warnings
    };
  }
}
