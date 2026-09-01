import { RecorderState } from './recorder_state';
import { ActionDefinition } from '@automation-studio/types';
import { RawRecorderEvent } from '../events/raw_event';

export interface RecorderSession {
  sessionId: string;
  executionId: string;
  projectId: string;
  testId: string;
  source: string;
  startedAt: string;
  stoppedAt?: string;
  state: RecorderState;
  events: RawRecorderEvent[];
  actions: ActionDefinition[];
  repository: any; // Will be properly typed when ObjectRepository is built
  metadata: Record<string, unknown>;
}
