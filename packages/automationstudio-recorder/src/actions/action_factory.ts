import { ActionDefinition } from '@automation-studio/types';
import { NormalizedEvent } from '../events/normalized_event';

export class ActionFactory {
  private static actionCounter = 0;

  static createAction(event: NormalizedEvent): ActionDefinition {
    this.actionCounter++;
    const actionId = `action-${Date.now()}-${this.actionCounter}`;

    let target: any = undefined;
    if (event.target && event.target.objectId) {
      target = { object: { objectId: event.target.objectId } };
    }

    return {
      id: actionId,
      type: event.type as any, // Cast to the ActionDefinition type enum
      target: target,
      value: event.value,
      metadata: {
        timestamp: event.timestamp,
        coordinates: event.coordinates
      }
    };
  }
}
