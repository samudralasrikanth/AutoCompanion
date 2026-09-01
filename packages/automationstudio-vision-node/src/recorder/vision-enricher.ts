import { randomUUID } from 'crypto';
import type { SemanticAction } from '@automation-studio/recorder';
import type { IObjectRepository } from '@automation-studio/sdk';
import { VisionEngine } from '../vision/vision-engine';

export class VisionEnricher {
  constructor(
    private readonly engine: VisionEngine,
    private readonly repository: IObjectRepository,
  ) {}

  public async enrich(action: SemanticAction): Promise<SemanticAction> {
    if (!action.metadata.screenshotBefore) {
      return action;
    }

    if (['click', 'doubleClick', 'rightClick', 'hover', 'type'].includes(action.action)) {
      const newObjectId = randomUUID();
      const newObject = {
        id: newObjectId,
        name: `${action.action}_target_${Date.now()}`,
        folderPath: 'Recordings',
        definition: {},
        metadata: { source: 'recorder' },
      };
      await this.repository.saveObject(newObject);
      action.target = newObjectId;
      action.metadata.confidence = 0.95;
    }

    return action;
  }
}
