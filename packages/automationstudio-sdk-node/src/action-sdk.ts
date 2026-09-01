import type { StepContext } from '@automation-studio/context';
import type { IUIElement } from './object-repository';

export interface IActionOptions {
  timeout?: number;
  retries?: number;
}

export interface IAction {
  execute(element: IUIElement, context: StepContext, options?: IActionOptions): Promise<void>;
}

export interface ICondition {
  evaluate(element: IUIElement, context: StepContext): Promise<boolean>;
}

export interface IAssertion {
  assert(element: IUIElement, expectedValue: any, context: StepContext): Promise<void>;
}

export interface IExtractor {
  extract(element: IUIElement, context: StepContext): Promise<any>;
}

export interface IValidator {
  validate(data: any): boolean;
}
