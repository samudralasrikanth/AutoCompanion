import { describe, beforeEach, afterEach, test, expect, vi } from 'vitest';
import { EventNormalizer } from '../src/events/event_normalizer';
import { NormalizedEvent } from '../src/events/normalized_event';

describe('EventNormalizer Coalescing Logic', () => {
  let normalizer: EventNormalizer;
  let emittedEvents: NormalizedEvent[];

  beforeEach(() => {
    emittedEvents = [];
    normalizer = new EventNormalizer((event) => {
      emittedEvents.push(event);
    });
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('should coalesce mousedown and mouseup into click', () => {
    normalizer.process({
      eventId: 'e1', sessionId: "s-1", sequenceNumber: 1,
      source: 'browser',
      timestamp: 't1',
      type: 'mousedown',
      payload: { target: { objectId: 'btn-1' }, x: 10, y: 20 }
    });
    
    // No click emitted immediately
    expect(emittedEvents.length).toBe(0);

    normalizer.process({
      eventId: 'e2', sessionId: "s-1", sequenceNumber: 1,
      source: 'browser',
      timestamp: 't2',
      type: 'mouseup',
      payload: { target: { objectId: 'btn-1' }, x: 10, y: 20 }
    });

    // Emits click
    expect(emittedEvents.length).toBe(1);
    expect(emittedEvents[0].type).toBe('click');
    expect(emittedEvents[0].target?.objectId).toBe('btn-1');
  });

  test('should emit mousedown if no mouseup within timeout', () => {
    normalizer.process({
      eventId: 'e1', sessionId: "s-1", sequenceNumber: 1,
      source: 'browser',
      timestamp: 't1',
      type: 'mousedown',
      payload: { target: { objectId: 'btn-1' }, x: 10, y: 20 }
    });
    
    expect(emittedEvents.length).toBe(0);

    vi.advanceTimersByTime(501);

    // Emits mousedown
    expect(emittedEvents.length).toBe(1);
    expect(emittedEvents[0].type).toBe('mousedown');
    
    // Subsequent mouseup is ignored for click coalescing
    normalizer.process({
      eventId: 'e2', sessionId: "s-1", sequenceNumber: 1,
      source: 'browser',
      timestamp: 't2',
      type: 'mouseup',
      payload: { target: { objectId: 'btn-1' }, x: 10, y: 20 }
    });
    
    // Wait for the mouseup to just pass through, right now the normalizer filters orphan mouseup
    expect(emittedEvents.length).toBe(1);
  });

  test('should coalesce consecutive keydown into type', () => {
    const chars = ['H', 'e', 'l', 'l', 'o'];
    let time = 1;
    for (const char of chars) {
      normalizer.process({
        eventId: `e${time}`, sessionId: "s-1", sequenceNumber: 1,
        source: 'browser',
        timestamp: `t${time}`,
        type: 'keydown',
        payload: { target: { objectId: 'input-1' }, key: char }
      });
      time++;
    }

    expect(emittedEvents.length).toBe(0);

    vi.advanceTimersByTime(301);

    expect(emittedEvents.length).toBe(1);
    expect(emittedEvents[0].type).toBe('type');
    expect(emittedEvents[0].value).toBe('Hello');
  });

  test('should flush key buffer on special key and emit keypress', () => {
    const chars = ['A', 'b'];
    let time = 1;
    for (const char of chars) {
      normalizer.process({
        eventId: `e${time}`, sessionId: "s-1", sequenceNumber: 1,
        source: 'browser',
        timestamp: `t${time}`,
        type: 'keydown',
        payload: { target: { objectId: 'input-1' }, key: char }
      });
      time++;
    }
    
    expect(emittedEvents.length).toBe(0);

    normalizer.process({
      eventId: `e${time}`, sessionId: "s-1", sequenceNumber: 1,
      source: 'browser',
      timestamp: `t${time}`,
      type: 'keydown',
      payload: { target: { objectId: 'input-1' }, key: 'Enter' }
    });

    expect(emittedEvents.length).toBe(2); // 'type' for "Ab" and 'keypress' for "Enter"
    expect(emittedEvents[0].type).toBe('type');
    expect(emittedEvents[0].value).toBe('Ab');
    expect(emittedEvents[1].type).toBe('keypress');
    expect(emittedEvents[1].value).toBe('Enter');
  });

  test('should drop pure mousemove events', () => {
    normalizer.process({
      eventId: 'e1', sessionId: "s-1", sequenceNumber: 1,
      source: 'browser',
      timestamp: 't1',
      type: 'mousemove',
      payload: { x: 10, y: 20 }
    });

    expect(emittedEvents.length).toBe(0);
  });
});
