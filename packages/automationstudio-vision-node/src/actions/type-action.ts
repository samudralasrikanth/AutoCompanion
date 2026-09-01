import type { IStep } from '@automation-studio/sdk/src/scenario/scenario-ir';
import type { MatchResult } from '../vision/vision-types';
import type { ExecutionResult } from '@automation-studio/sdk/src/execution/automation-backend';
import type { IVisionAction, IVisionActionContext } from './action-types';
import { mapToVisionLocator } from './mapper';

export class TypeAction implements IVisionAction {
  async execute(step: IStep, context: IVisionActionContext): Promise<ExecutionResult> {
    if (!step.target) {
      throw new Error(`TypeAction requires a target. Step ID: ${step.id}`);
    }

    const textParam = step.parameters?.find(p => p.name === 'text');
    if (!textParam) {
      throw new Error(`TypeAction requires a 'text' parameter. Step ID: ${step.id}`);
    }

    const obj = await context.resolveObject(step.target);
    if (!obj) {
      throw new Error(`TypeAction: Target object not found for ID: ${step.target}`);
    }

    const locator = mapToVisionLocator(obj);
    return context.pipeline.execute({
      action: 'type',
      locator,
      options: { text: textParam.value },
      transaction: { id: step.id }
    });
  }
}
