import { ActionDefinition } from '@automation-studio/types';
import { NormalizedEvent } from '../events/normalized_event';
import { ActionFactory } from './action_factory';

export class ActionBuilder {
  private actions: ActionDefinition[] = [];

  processNormalizedEvent(event: NormalizedEvent): void {
    // Only process actionable normalized events
    // For now, assume all normalized events map to an action
    // In the future, we might have filter rules here.
    
    // Ignore internal events if they exist
    if (event.type === 'mousedown' || event.type === 'mouseup') {
        // typically handled by normalizer but in case they leak
        return;
    }

    const action = ActionFactory.createAction(event);
    this.actions.push(action);
  }

  getActions(): ActionDefinition[] {
    return this.actions;
  }
}
