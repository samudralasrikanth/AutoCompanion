/**
 * DI Container tests.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ServiceCollection } from '../di/service-collection';
import { ServiceProvider } from '../di/service-provider';
import { createServiceIdentifier, type IServiceProvider, type IAsyncDisposable } from '@automation-studio/types';

describe('ServiceCollection', () => {
  let collection: ServiceCollection;

  beforeEach(() => {
    collection = new ServiceCollection();
  });

  it('should register singleton services', () => {
    const id = createServiceIdentifier<string>('test');
    collection.addSingleton(id, () => 'hello');
    expect(collection.has(id)).toBe(true);
  });

  it('should register transient services', () => {
    const id = createServiceIdentifier<number>('counter');
    collection.addTransient(id, () => 42);
    expect(collection.has(id)).toBe(true);
  });

  it('should return all descriptors', () => {
    const id1 = createServiceIdentifier<string>('a');
    const id2 = createServiceIdentifier<string>('b');
    collection.addSingleton(id1, () => 'a');
    collection.addTransient(id2, () => 'b');
    expect(collection.getDescriptors()).toHaveLength(2);
  });

  it('should report has() correctly for unregistered', () => {
    const id = createServiceIdentifier<string>('missing');
    expect(collection.has(id)).toBe(false);
  });
});

describe('ServiceProvider', () => {
  let collection: ServiceCollection;

  beforeEach(() => {
    collection = new ServiceCollection();
  });

  describe('singleton resolution', () => {
    it('should return the same instance', () => {
      const id = createServiceIdentifier<{ value: number }>('counter');
      let counter = 0;
      collection.addSingleton(id, () => ({ value: ++counter }));

      const provider = new ServiceProvider(collection);
      const first = provider.resolve(id);
      const second = provider.resolve(id);

      expect(first).toBe(second);
      expect(first.value).toBe(1);
    });
  });

  describe('transient resolution', () => {
    it('should return new instances each time', () => {
      const id = createServiceIdentifier<{ value: number }>('counter');
      let counter = 0;
      collection.addTransient(id, () => ({ value: ++counter }));

      const provider = new ServiceProvider(collection);
      const first = provider.resolve(id);
      const second = provider.resolve(id);

      expect(first).not.toBe(second);
      expect(first.value).toBe(1);
      expect(second.value).toBe(2);
    });
  });

  describe('missing registration', () => {
    it('should throw descriptive error', () => {
      const id = createServiceIdentifier<string>('missing');
      const provider = new ServiceProvider(collection);

      expect(() => provider.resolve(id)).toThrow('missing');
    });
  });

  describe('tryResolve', () => {
    it('should return undefined for missing services', () => {
      const id = createServiceIdentifier<string>('missing');
      const provider = new ServiceProvider(collection);

      expect(provider.tryResolve(id)).toBeUndefined();
    });

    it('should return instance for registered services', () => {
      const id = createServiceIdentifier<string>('found');
      collection.addSingleton(id, () => 'hello');

      const provider = new ServiceProvider(collection);
      expect(provider.tryResolve(id)).toBe('hello');
    });
  });

  describe('circular dependency detection', () => {
    it('should throw with dependency chain', () => {
      const idA = createServiceIdentifier<unknown>('A');
      const idB = createServiceIdentifier<unknown>('B');

      collection.addSingleton(idA, (p: IServiceProvider) => {
        p.resolve(idB);
        return {};
      });

      collection.addSingleton(idB, (p: IServiceProvider) => {
        p.resolve(idA);
        return {};
      });

      const provider = new ServiceProvider(collection);

      expect(() => provider.resolve(idA)).toThrow(/[Cc]ircular/);
    });
  });

  describe('disposal', () => {
    it('should dispose in reverse creation order', async () => {
      const order: string[] = [];
      const idA = createServiceIdentifier<IAsyncDisposable>('A');
      const idB = createServiceIdentifier<IAsyncDisposable>('B');

      collection.addSingleton(idA, () => ({
        dispose: async () => { order.push('A'); },
      }));

      collection.addSingleton(idB, () => ({
        dispose: async () => { order.push('B'); },
      }));

      const provider = new ServiceProvider(collection);
      provider.resolve(idA);
      provider.resolve(idB);

      await provider.dispose();

      expect(order).toEqual(['B', 'A']);
    });

    it('should throw after disposal', async () => {
      const id = createServiceIdentifier<string>('test');
      collection.addSingleton(id, () => 'hello');

      const provider = new ServiceProvider(collection);
      await provider.dispose();

      expect(() => provider.resolve(id)).toThrow(/disposed/);
    });
  });

  describe('lazy resolution', () => {
    it('should defer creation until first access', () => {
      let created = false;
      const id = createServiceIdentifier<{ value: string }>('lazy');

      collection.addSingleton(id, () => {
        created = true;
        return { value: 'deferred' };
      }, { lazy: true });

      const provider = new ServiceProvider(collection);
      const proxy = provider.resolve(id);

      expect(created).toBe(false);

      // Access triggers creation
      expect(proxy.value).toBe('deferred');
      expect(created).toBe(true);
    });
  });

  describe('has', () => {
    it('should return true for registered services', () => {
      const id = createServiceIdentifier<string>('test');
      collection.addSingleton(id, () => 'hello');
      const provider = new ServiceProvider(collection);
      expect(provider.has(id)).toBe(true);
    });

    it('should return false for unregistered services', () => {
      const id = createServiceIdentifier<string>('missing');
      const provider = new ServiceProvider(collection);
      expect(provider.has(id)).toBe(false);
    });
  });
});
