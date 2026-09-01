import type { GlobalContext, SuiteContext, ScenarioContext, StepContext } from '@automation-studio/context';
import type { IPluginContext } from '@automation-studio/types';

export interface IFrameworkLifecycle {
  onGlobalStart?(context: GlobalContext): Promise<void>;
  onGlobalEnd?(context: GlobalContext): Promise<void>;
  
  onSuiteStart?(context: SuiteContext): Promise<void>;
  onSuiteEnd?(context: SuiteContext): Promise<void>;
  
  onScenarioStart?(context: ScenarioContext): Promise<void>;
  onScenarioEnd?(context: ScenarioContext): Promise<void>;
  
  onStepStart?(context: StepContext): Promise<void>;
  onStepEnd?(context: StepContext): Promise<void>;
}

export abstract class BaseFramework implements IFrameworkLifecycle {
  constructor(public readonly name: string, public readonly version: string) {}

  public abstract initialize(context?: IPluginContext): Promise<void>;
  public abstract dispose(): Promise<void>;

  public async onGlobalStart(context: GlobalContext): Promise<void> {}
  public async onGlobalEnd(context: GlobalContext): Promise<void> {}
  public async onSuiteStart(context: SuiteContext): Promise<void> {}
  public async onSuiteEnd(context: SuiteContext): Promise<void> {}
  public async onScenarioStart(context: ScenarioContext): Promise<void> {}
  public async onScenarioEnd(context: ScenarioContext): Promise<void> {}
  public async onStepStart(context: StepContext): Promise<void> {}
  public async onStepEnd(context: StepContext): Promise<void> {}
}
