/**
 * Event Bus tests.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventBus } from '../event-bus';
import { createEvent } from '../event-factory';

describe('EventBus', () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = new EventBus({ maxHistorySize: 10, enableReplay: true });
  });

  describe('publish/subscribe', () => {
    it('should deliver events to subscribers', () => {
      const handler = vi.fn();
      bus.subscribe('test.event', handler);

      const event = createEvent('test.event', { message: 'hello' });
      bus.publish(event);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(event);
    });

    it('should deliver events to multiple subscribers', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      bus.subscribe('test.event', handler1);
      bus.subscribe('test.event', handler2);

      bus.publish(createEvent('test.event', { value: 42 }));

      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);
    });

    it('should not deliver events to unrelated subscribers', () => {
      const handler = vi.fn();
      bus.subscribe('other.event', handler);

      bus.publish(createEvent('test.event', {}));

      expect(handler).not.toHaveBeenCalled();
    });

    it('should handle typed payloads correctly', () => {
      interface TestPayload { count: number; label: string }
      let receivedPayload: TestPayload | undefined;

      bus.subscribe<TestPayload>('typed.event', (event) => {
        receivedPayload = event.payload;
      });

      bus.publish(createEvent<TestPayload>('typed.event', { count: 5, label: 'test' }));

      expect(receivedPayload).toEqual({ count: 5, label: 'test' });
    });
  });

  describe('once', () => {
    it('should fire handler exactly once', () => {
      const handler = vi.fn();
      bus.once('one-time', handler);

      bus.publish(createEvent('one-time', {}));
      bus.publish(createEvent('one-time', {}));
      bus.publish(createEvent('one-time', {}));

      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe('unsubscribe', () => {
    it('should stop delivering events after unsubscribe', () => {
      const handler = vi.fn();
      const sub = bus.subscribe('test.event', handler);

      bus.publish(createEvent('test.event', {}));
      expect(handler).toHaveBeenCalledTimes(1);

      bus.unsubscribe(sub);

      bus.publish(createEvent('test.event', {}));
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should stop via subscription.dispose()', () => {
      const handler = vi.fn();
      const sub = bus.subscribe('test.event', handler);

      sub.dispose();

      bus.publish(createEvent('test.event', {}));
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('error isolation', () => {
    it('should not break other handlers when one throws', () => {
      const handler1 = vi.fn(() => { throw new Error('boom'); });
      const handler2 = vi.fn();

      bus.subscribe('test.event', handler1);
      bus.subscribe('test.event', handler2);

      bus.publish(createEvent('test.event', {}));

      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);
    });
  });

  describe('replay', () => {
    it('should return recent events', () => {
      bus.publish(createEvent('test.event', { n: 1 }));
      bus.publish(createEvent('test.event', { n: 2 }));
      bus.publish(createEvent('test.event', { n: 3 }));

      const replayed = bus.replay('test.event');
      expect(replayed).toHaveLength(3);
    });

    it('should respect count parameter', () => {
      for (let i = 0; i < 5; i++) {
        bus.publish(createEvent('test.event', { n: i }));
      }

      const replayed = bus.replay('test.event', 2);
      expect(replayed).toHaveLength(2);
    });

    it('should respect max history size', () => {
      for (let i = 0; i < 20; i++) {
        bus.publish(createEvent('test.event', { n: i }));
      }

      const replayed = bus.replay('test.event');
      expect(replayed).toHaveLength(10); // maxHistorySize = 10
    });
  });

  describe('dispose', () => {
    it('should throw after disposal', () => {
      bus.dispose();
      expect(() => bus.publish(createEvent('test', {}))).toThrow('disposed');
    });
  });

  describe('historySize', () => {
    it('should track total history across event types', () => {
      bus.publish(createEvent('a', {}));
      bus.publish(createEvent('b', {}));
      bus.publish(createEvent('c', {}));

      expect(bus.historySize).toBe(3);
    });
  });
});
