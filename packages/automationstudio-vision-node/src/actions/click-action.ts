import type { IStep } from '@automation-studio/sdk/src/scenario/scenario-ir';
import type { MatchResult } from '../vision/vision-types';
import type { ExecutionResult } from '@automation-studio/sdk/src/execution/automation-backend';
import type { IVisionAction, IVisionActionContext } from './action-types';
import { mapToVisionLocator } from './mapper';

export class ClickAction implements IVisionAction {
  async execute(step: IStep, context: IVisionActionContext): Promise<ExecutionResult> {
    if (!step.target) {
      throw new Error(`ClickAction requires a target. Step ID: ${step.id}`);
    }

    const obj = await context.resolveObject(step.target);
    if (!obj) {
      throw new Error(`ClickAction: Target object not found for ID: ${step.target}`);
    }

    const locator = mapToVisionLocator(obj);
    return context.pipeline.execute({
      action: 'click',
      locator,
      transaction: { id: step.id }
    });
  }
}
