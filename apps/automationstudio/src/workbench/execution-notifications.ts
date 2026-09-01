import { ExecutionEvents } from '@automation-studio/events';
import type { IEventBus } from '@automation-studio/types';
import type { INotificationService } from './workbench-types';
import * as path from 'path';

export class ExecutionNotifications {
  constructor(
    private readonly eventBus: IEventBus,
    private readonly notificationService: INotificationService
  ) {
    this.setupListeners();
  }

  private setupListeners(): void {
    this.eventBus.subscribe(ExecutionEvents.ExecutionStarted, (event: any) => {
      const payload = event.payload;
      const scenarioName = path.basename(payload.scenarioPath || '');
      this.notificationService.info(`Started execution: ${scenarioName}`);
    });

    this.eventBus.subscribe(ExecutionEvents.ExecutionCompleted, (event: any) => {
      const payload = event.payload;
      const durationSeconds = (payload.duration / 1000).toFixed(1);
      this.notificationService.info(`✅ Execution Passed (${durationSeconds}s)`);
    });

    this.eventBus.subscribe(ExecutionEvents.ExecutionFailed, (event: any) => {
      const payload = event.payload;
      const durationSeconds = (payload.duration / 1000).toFixed(1);
      this.notificationService.error(`❌ Execution Failed (${durationSeconds}s): ${payload.error}`);
    });

    this.eventBus.subscribe(ExecutionEvents.ExecutionAborted, (event: any) => {
      const payload = event.payload;
      const durationSeconds = (payload.duration / 1000).toFixed(1);
      this.notificationService.warn(`⚠️ Execution Aborted (${durationSeconds}s)`);
    });
  }
}
