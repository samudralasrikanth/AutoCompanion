import * as path from 'path';
import * as fs from 'fs';
import type { IEventBus, ILogger, IEvent } from '@automation-studio/types';
import { ExecutionEvents, ArtifactCreatedPayload } from '@automation-studio/events';

export class ArtifactManager {
  constructor(
    private readonly eventBus: IEventBus,
    private readonly logger: ILogger,
    private readonly workspaceRoot: string | (() => string)
  ) {
    this.setupListeners();
  }

  private getOutputRoot(): string {
    return typeof this.workspaceRoot === 'function' ? this.workspaceRoot() : this.workspaceRoot;
  }

  private setupListeners(): void {
    this.eventBus.subscribe(ExecutionEvents.ArtifactCreated, (event: IEvent<ArtifactCreatedPayload>) => {
      const payload = event.payload;
      this.logger.info(`Received artifact: ${payload.artifactType} at ${payload.filePath}`);
      this.storeArtifact(payload);
    });
  }

  private storeArtifact(payload: ArtifactCreatedPayload): void {
    try {
      const artifactRoot = payload.artifactType === 'screenshot'
        ? path.join(this.getOutputRoot(), 'artifacts', 'screenshots')
        : payload.artifactType === 'log'
          ? path.join(this.getOutputRoot(), 'artifacts', 'logs')
          : payload.artifactType === 'report'
            ? path.join(this.getOutputRoot(), '.automationstudio', 'reports')
            : path.join(this.getOutputRoot(), 'artifacts', 'attachments');
      const artifactDir = path.join(artifactRoot, payload.executionId);
      if (!fs.existsSync(artifactDir)) {
        fs.mkdirSync(artifactDir, { recursive: true });
      }

      const fileName = path.basename(payload.filePath);
      const destPath = path.join(artifactDir, fileName);

      if (fs.existsSync(payload.filePath)) {
        fs.copyFileSync(payload.filePath, destPath);
        this.logger.info(`Stored artifact at ${destPath}`);
      } else {
        this.logger.warn(`Artifact not found at source path: ${payload.filePath}`);
      }
    } catch (error) {
      this.logger.error(`Failed to store artifact: ${(error as Error).message}`);
    }
  }
}
