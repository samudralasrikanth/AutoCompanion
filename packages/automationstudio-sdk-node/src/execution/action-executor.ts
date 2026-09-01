import type { ActionType, IStep, ScenarioMode, StepResult } from '../scenario/scenario-ir';
import type { IObjectResolver } from '../repository/unified-object';

export interface ISecretResolver {
  resolve(uri: string): Promise<string>;
  isSecretUri(value: string): boolean;
}

export interface IDataResolver {
  resolve(uri: string): unknown;
  isDataUri(value: string): boolean;
}

export interface ExecutionContext {
  mode: ScenarioMode;
  variables: Record<string, unknown>;
  signal?: AbortSignal;
  secretManager: ISecretResolver;
  objectRepo: IObjectResolver;
  dataProvider: IDataResolver;
}

export interface ActionExecutor {
  execute(step: IStep, context: ExecutionContext): Promise<StepResult>;
}

export interface RegisteredActionExecutor {
  type: ActionType;
  execute: ActionExecutor['execute'];
}
