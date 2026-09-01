import type { ValidatedEvent, ResolvedEvent, PipelineResult } from '@automation-studio/recorder';

export class EventResolver {
  public resolve(event: ValidatedEvent): PipelineResult<ResolvedEvent> {
    const prior = event as Partial<ResolvedEvent>;
    const resolvedEvent: ResolvedEvent = {
      ...event,
      // Preserve recorder-provided semantics. A placeholder target makes
      // coordinate-only Surface evidence look like a real object.
      targetElement: prior.targetElement || event.metadata?.['targetElement'] || (event.type === 'mouse' ? undefined : 'Window'),
      targetName: prior.targetName || event.metadata?.['targetName'],
      targetRole: prior.targetRole || event.metadata?.['targetRole'],
    };

    return {
      data: resolvedEvent,
      errors: [],
      warnings: []
    };
  }
}
