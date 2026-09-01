import * as fs from 'fs';
import * as path from 'path';
import { ExecutionError } from '../errors';

export interface Artifact {
  id: string;
  type: 'screenshot' | 'log' | 'json' | 'html' | 'xml' | 'csv' | 'text' | 'video' | 'attachment';
  name: string;
  path: string;
  stepId?: string;
}

export class ArtifactService {
  private artifacts: Artifact[] = [];

  constructor(private readonly outputDirectory: string) {
    if (!fs.existsSync(outputDirectory)) {
      fs.mkdirSync(outputDirectory, { recursive: true });
    }
  }

  public async attachFile(sourcePath: string, type: Artifact['type'], name: string, stepId?: string): Promise<Artifact> {
    if (!fs.existsSync(sourcePath)) {
      throw new ExecutionError(`Artifact source file not found: ${sourcePath}`);
    }

    const ext = path.extname(sourcePath);
    const artifactId = `art_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const destinationPath = path.join(this.outputDirectory, `${artifactId}${ext}`);

    await fs.promises.copyFile(sourcePath, destinationPath);

    const artifact: Artifact = {
      id: artifactId,
      type,
      name,
      path: destinationPath,
      stepId
    };

    this.artifacts.push(artifact);
    return artifact;
  }

  public getArtifacts(): Artifact[] {
    return [...this.artifacts];
  }
}
