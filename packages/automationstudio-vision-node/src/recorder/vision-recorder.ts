import type { IRecorder, RecordSession } from '@automation-studio/recorder';
import { VisionRecordSession } from './vision-record-session';

export class VisionRecorder implements IRecorder {
  public readonly name = 'vision-recorder';

  public async createSession(_target?: unknown): Promise<RecordSession> {
    const session = new VisionRecordSession();
    await session.start();

    return {
      id: session.sessionId,
      technology: 'vision',
      startedAt: Date.now(),
      status: session.getState(),
      statistics: {
        eventCount: 0,
        clickCount: 0,
        keyCount: 0,
        windowChanges: 0,
        durationMs: 0,
        errors: 0,
        warnings: 0,
      },
      screenshots: [],
      events: [],
      metadata: { liveSession: session },
    };
  }
}
