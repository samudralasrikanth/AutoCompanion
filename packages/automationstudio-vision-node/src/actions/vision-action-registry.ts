import type { IVisionAction } from './action-types';
import { ClickAction } from './click-action';
import { TypeAction } from './type-action';
import { WaitAction } from './wait-action';
import type { ActionType } from '@automation-studio/sdk/src/scenario/scenario-ir';

export class VisionActionRegistry {
  private actions: Map<string, IVisionAction> = new Map();

  constructor() {
    this.registerDefaults();
  }

  private registerDefaults(): void {
    this.register('click', new ClickAction());
    this.register('type', new TypeAction());
    this.register('waitNavigation', new WaitAction()); // Reusing wait for now
  }

  public register(type: ActionType | string, action: IVisionAction): void {
    this.actions.set(type, action);
  }

  public get(type: ActionType | string): IVisionAction {
    const action = this.actions.get(type);
    if (!action) {
      throw new Error(`VisionActionRegistry: No action found for type '${type}'`);
    }
    return action;
  }
}
