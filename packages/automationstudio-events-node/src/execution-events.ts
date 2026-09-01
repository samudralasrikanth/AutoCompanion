import type { UUID, Timestamp } from '@automation-studio/types';

export const ExecutionEvents = {
  ExecutionStarted: 'execution.started',
  ExecutionProgress: 'execution.progress',
  ExecutionCompleted: 'execution.completed',
  ExecutionFailed: 'execution.failed',
  ExecutionAborted: 'execution.aborted',
  ExecutionPaused: 'execution.paused',
  ExecutionResumed: 'execution.resumed',
  ArtifactCreated: 'execution.artifact_created',
} as const;

export interface ExecutionStartedPayload {
  readonly executionId: UUID;
  readonly scenarioPath: string;
  readonly timestamp: Timestamp;
}

export interface ExecutionProgressPayload {
  readonly executionId: UUID;
  readonly progress: number; // 0-100
  readonly step: string;
  readonly totalSteps?: number;
  readonly currentStep?: number;
}

export interface ExecutionCompletedPayload {
  readonly executionId: UUID;
  readonly duration: number;
}

export interface ExecutionFailedPayload {
  readonly executionId: UUID;
  readonly error: string;
  readonly duration: number;
}

export interface ExecutionAbortedPayload {
  readonly executionId: UUID;
  readonly duration: number;
}

export interface ArtifactCreatedPayload {
  readonly executionId: UUID;
  readonly artifactType: 'screenshot' | 'log' | 'report' | 'attachment';
  readonly filePath: string;
  readonly mimeType?: string;
}
