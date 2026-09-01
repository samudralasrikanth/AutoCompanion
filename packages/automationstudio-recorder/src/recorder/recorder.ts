import { RecorderSession } from './recorder_session';

export interface RecorderStartOptions {
  executionId: string;
  projectId: string;
  testId: string;
  source: string;
  metadata?: Record<string, unknown>;
}

export interface RecordingResult {
  sessionId: string;
  session: RecorderSession;
}

export interface Recorder {
  start(options: RecorderStartOptions): Promise<RecorderSession>;
  pause(sessionId: string): Promise<void>;
  resume(sessionId: string): Promise<void>;
  stop(sessionId: string): Promise<RecordingResult>;
  cancel(sessionId: string): Promise<void>;
}
