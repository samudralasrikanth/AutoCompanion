import type { IStep } from '@automation-studio/sdk/src/scenario/scenario-ir';
import type { MatchResult } from '../vision/vision-types';
import type { ExecutionResult } from '@automation-studio/sdk/src/execution/automation-backend';
import type { IVisionAction, IVisionActionContext } from './action-types';
import { mapToVisionLocator } from './mapper';

export class WaitAction implements IVisionAction {
  async execute(step: IStep, context: IVisionActionContext): Promise<ExecutionResult> {
    if (!step.target) {
      throw new Error(`WaitAction requires a target. Step ID: ${step.id}`);
    }

    const obj = await context.resolveObject(step.target);
    if (!obj) {
      throw new Error(`WaitAction: Target object not found for ID: ${step.target}`);
    }

    const timeoutParam = step.parameters?.find(p => p.name === 'timeout');
    const timeoutMs = timeoutParam ? parseInt(timeoutParam.value, 10) : 10000;

    const locator = mapToVisionLocator(obj);
    return context.pipeline.execute({
      action: 'wait',
      locator,
      execution: {
        retries: 0,
        timeout: timeoutMs,
        confidenceThreshold: 80,
        waitAfter: 0,
        onFailure: 'abort',
        retryStrategy: 'fixed'
      },
      verification: {
        condition: 'exists',
        timeout: timeoutMs
      },
      transaction: { id: step.id }
    });
  }
}
