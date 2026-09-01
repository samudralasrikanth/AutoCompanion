import type { SemanticAction, PipelineResult } from '@automation-studio/recorder';
import type { IStep, ActionType } from '@automation-studio/sdk';
import { randomUUID } from 'crypto';

export class ActivityBuilder {
  public build(action: SemanticAction): PipelineResult<IStep> {
    try {
      const step: IStep = {
        id: randomUUID(),
        type: this.mapActionType(action.action),
        target: action.target || '',
        timestamp: action.timestamp,
        parameters: Object.entries(action.parameters).map(([name, value]) => ({ name, value: String(value) })),
        surface: this.surfaceOptions(action),
      };

      return {
        data: step,
        errors: [],
        warnings: []
      };
    } catch (e: any) {
      return {
        errors: [`Activity build failed: ${e.message}`],
        warnings: []
      };
    }
  }

  private surfaceOptions(action: SemanticAction): IStep['surface'] {
    const metadata = action.metadata || {};
    const evidence = metadata['surfaceEvidence'];
    if (!Array.isArray(evidence) && !metadata['windowTitle'] && !metadata['region']) return undefined;
    return {
      windowTitle: typeof metadata['windowTitle'] === 'string' ? metadata['windowTitle'] : undefined,
      screen: metadata['monitor'] !== undefined ? String(metadata['monitor']) : undefined,
      locators: Array.isArray(evidence) ? evidence : undefined,
    };
  }

  private mapActionType(action: string): ActionType {
    if (action === 'drag') return 'dragAndDrop';
    if (action === 'assert') return 'assertVisible';
    if (action === 'wait') return 'waitNavigation';
    return action as ActionType;
  }
}
