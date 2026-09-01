import type { IStep } from '@automation-studio/sdk/src/scenario/scenario-ir';
import type { IVisualObject } from '@automation-studio/sdk/src/repository/object-repository';
import type { ExecutionResult, AutomationCommand } from '@automation-studio/sdk/src/execution/automation-backend';
import type { ActionPipeline } from '@automation-studio/sdk/src/execution/action-pipeline';

export interface IVisionActionContext {
  pipeline: ActionPipeline;
  resolveObject(objectId: string): Promise<IVisualObject | undefined>;
}

export interface IVisionAction {
  execute(step: IStep, context: IVisionActionContext): Promise<ExecutionResult>;
}
