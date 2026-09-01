/**
 * Project event type constants and payload interfaces (EPIC-0002).
 */

import type { ProjectTechnology, UUID, Timestamp } from '@automation-studio/types';

export const ProjectEvents = {
  ProjectCreated: 'project.created',
  ProjectOpened: 'project.opened',
  ProjectClosed: 'project.closed',
  ProjectDeleted: 'project.deleted',
  ProjectRenamed: 'project.renamed',

  WorkspaceLoaded: 'project.workspace.loaded',
  WorkspaceSaved: 'project.workspace.saved',

  IndexUpdated: 'project.index.updated',
  IndexingStarted: 'project.index.started',
  IndexingCompleted: 'project.index.completed',

  ValidationCompleted: 'project.validation.completed',

  FileChanged: 'project.file.changed',
  FileCreated: 'project.file.created',
  FileDeleted: 'project.file.deleted',

  MigrationStarted: 'project.migration.started',
  MigrationCompleted: 'project.migration.completed',
  MigrationFailed: 'project.migration.failed',
} as const;

export interface ProjectCreatedPayload {
  readonly projectId: UUID;
  readonly projectName: string;
  readonly technology: ProjectTechnology;
  readonly path: string;
  readonly template: string;
}

export interface ProjectOpenedPayload {
  readonly projectId: UUID;
  readonly projectName: string;
  readonly path: string;
  readonly technology: ProjectTechnology;
}

export interface ProjectClosedPayload {
  readonly projectId: UUID;
  readonly projectName: string;
}

export interface ProjectDeletedPayload {
  readonly projectId: UUID;
  readonly path: string;
}

export interface ProjectRenamedPayload {
  readonly projectId: UUID;
  readonly oldName: string;
  readonly newName: string;
}

export interface WorkspaceLoadedPayload {
  readonly projectId: UUID;
  readonly restoredFiles: number;
  readonly restoredBreakpoints: number;
}

export interface IndexUpdatedPayload {
  readonly totalFiles: number;
  readonly duration: number;
  readonly categories: Record<string, number>;
}

export interface ValidationCompletedPayload {
  readonly valid: boolean;
  readonly issueCount: number;
  readonly errorCount: number;
  readonly warningCount: number;
  readonly duration: number;
}

export interface FileChangedPayload {
  readonly path: string;
  readonly changeType: 'created' | 'modified' | 'deleted';
  readonly timestamp: Timestamp;
}

export interface MigrationCompletedPayload {
  readonly fromVersion: number;
  readonly toVersion: number;
  readonly changes: number;
  readonly duration: number;
}
