import type { IEventBus } from '@automation-studio/types';
import { createEvent, ProjectEvents } from '@automation-studio/events';

/**
 * Bridges internal runtime events to the global Event Bus.
 */
export class RuntimeEventPublisher {
  constructor(private readonly eventBus: IEventBus) {}

  public publishRunStarted(runId: string): void {
    // We can define more granular events in the future.
    // For now, we simulate generic project events or create new runtime events if needed.
    this.eventBus.publish(
      createEvent(ProjectEvents.ProjectOpened, {
        projectId: runId as any,
        projectName: 'Runtime Execution',
        technology: 'api' as any,
        timestamp: Date.now() as any
      })
    );
  }

  public publishRunFinished(runId: string, status: 'success' | 'failure' | 'cancelled'): void {
    // ...
  }
}
