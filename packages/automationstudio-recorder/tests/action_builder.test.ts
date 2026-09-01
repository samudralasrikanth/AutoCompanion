import { ActionBuilder } from '../src/actions/action_builder';
import { beforeEach, describe, expect, test } from 'vitest';

describe('ActionBuilder', () => {
  let builder: ActionBuilder;

  beforeEach(() => {
    builder = new ActionBuilder();
  });

  test('should construct valid click action', () => {
    builder.processNormalizedEvent({
      type: 'click',
      timestamp: '2023-01-01T10:00:00Z',
      target: { objectId: 'btn-1' },
      coordinates: { x: 10, y: 20 }
    });

    const actions = builder.getActions();
    expect(actions.length).toBe(1);
    
    const clickAction = actions[0];
    expect(clickAction.type).toBe('click');
    expect(clickAction.id).toMatch(/^action-\d+-\d+$/);
    expect(clickAction.target?.object?.objectId).toBe('btn-1');
    expect(clickAction.metadata.timestamp).toBe('2023-01-01T10:00:00Z');
    expect(clickAction.metadata.coordinates).toEqual({ x: 10, y: 20 });
  });

  test('should construct valid type action', () => {
    builder.processNormalizedEvent({
      type: 'type',
      timestamp: '2023-01-01T10:00:05Z',
      target: { objectId: 'input-1' },
      value: 'Hello World'
    });

    const actions = builder.getActions();
    expect(actions.length).toBe(1);
    
    const typeAction = actions[0];
    expect(typeAction.type).toBe('type');
    expect(typeAction.target?.object?.objectId).toBe('input-1');
    expect(typeAction.value).toBe('Hello World');
  });

  test('should ignore mousedown and mouseup internal events', () => {
    builder.processNormalizedEvent({ type: 'mousedown', timestamp: '2023-01-01T10:00:00Z' });
    builder.processNormalizedEvent({ type: 'mouseup', timestamp: '2023-01-01T10:00:01Z' });

    expect(builder.getActions().length).toBe(0);
  });
});
