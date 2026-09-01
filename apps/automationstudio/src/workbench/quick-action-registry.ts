import type { IDisposable, ILogger } from '@automation-studio/types';
import type { IQuickAction, IQuickActionRegistry } from './workbench-types';
import { toDisposable } from '@automation-studio/shared';

export class QuickActionRegistry implements IQuickActionRegistry {
  private readonly actions = new Map<string, IQuickAction>();

  constructor(private readonly logger: ILogger) {}

  public registerAction(action: IQuickAction): IDisposable {
    if (this.actions.has(action.id)) {
      this.logger.warn(`Overwriting existing quick action: ${action.id}`);
    }
    
    this.actions.set(action.id, action);
    this.logger.debug(`Registered Quick Action: ${action.id}`);
    
    return toDisposable(() => {
      this.actions.delete(action.id);
    });
  }

  public getActions(): IQuickAction[] {
    return Array.from(this.actions.values());
  }
}
