/**
 * Shared utilities tests.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateUUID } from '../uuid';
import { DisposableStore, MutableDisposable, toDisposable } from '../disposable';
import { AsyncQueue } from '../async-queue';
import { retry } from '../retry';
import { debounce } from '../debounce';
import { throttle } from '../throttle';
import { CancellationTokenSource } from '../cancellation';
import { Stopwatch } from '../stopwatch';
import { normalizePath, isPathTraversal, ensureRelativePath } from '../path-utils';
import { isNonEmptyString, isValidProjectName, isValidVersion, validateRequired } from '../validation';

describe('UUID', () => {
  it('should generate valid v4 UUIDs', () => {
    const uuid = generateUUID();
    expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  it('should generate unique UUIDs', () => {
    const a = generateUUID();
    const b = generateUUID();
    expect(a).not.toBe(b);
  });
});

describe('DisposableStore', () => {
  it('should dispose all items in reverse order', () => {
    const order: number[] = [];
    const store = new DisposableStore();

    store.add(toDisposable(() => order.push(1)));
    store.add(toDisposable(() => order.push(2)));
    store.add(toDisposable(() => order.push(3)));

    store.dispose();

    expect(order).toEqual([3, 2, 1]);
  });

  it('should dispose new items immediately when already disposed', () => {
    const store = new DisposableStore();
    store.dispose();

    const fn = vi.fn();
    store.add(toDisposable(fn));

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should track size', () => {
    const store = new DisposableStore();
    store.add(toDisposable(() => {}));
    store.add(toDisposable(() => {}));
    expect(store.size).toBe(2);
  });
});

describe('MutableDisposable', () => {
  it('should dispose previous value when setting new', () => {
    const fn1 = vi.fn();
    const fn2 = vi.fn();
    const mutable = new MutableDisposable();

    mutable.value = toDisposable(fn1);
    mutable.value = toDisposable(fn2);

    expect(fn1).toHaveBeenCalledTimes(1);
    expect(fn2).not.toHaveBeenCalled();
  });
});

describe('AsyncQueue', () => {
  it('should execute tasks serially', async () => {
    const queue = new AsyncQueue();
    const order: number[] = [];

    await Promise.all([
      queue.enqueue(async () => { order.push(1); }),
      queue.enqueue(async () => { order.push(2); }),
      queue.enqueue(async () => { order.push(3); }),
    ]);

    expect(order).toEqual([1, 2, 3]);
  });

  it('should report isEmpty correctly', async () => {
    const queue = new AsyncQueue();
    expect(queue.isEmpty).toBe(true);

    const promise = queue.enqueue(async () => 'done');
    await promise;

    expect(queue.isEmpty).toBe(true);
  });
});

describe('Retry', () => {
  it('should succeed on first attempt', async () => {
    const result = await retry(async () => 'ok', { maxAttempts: 3 });
    expect(result).toBe('ok');
  });

  it('should retry on failure and eventually succeed', async () => {
    let attempt = 0;
    const result = await retry(async () => {
      attempt++;
      if (attempt < 3) throw new Error('fail');
      return 'ok';
    }, { maxAttempts: 3, baseDelay: 10 });

    expect(result).toBe('ok');
    expect(attempt).toBe(3);
  });

  it('should throw after max attempts', async () => {
    await expect(
      retry(async () => { throw new Error('always fails'); }, { maxAttempts: 2, baseDelay: 10 }),
    ).rejects.toThrow('always fails');
  });
});

describe('Debounce', () => {
  it('should debounce calls', async () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced();
    debounced();
    debounced();

    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });

  it('should support cancel', () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced();
    debounced.cancel();

    vi.advanceTimersByTime(200);
    expect(fn).not.toHaveBeenCalled();

    vi.useRealTimers();
  });
});

describe('CancellationToken', () => {
  it('should report cancellation', () => {
    const source = new CancellationTokenSource();
    expect(source.token.isCancellationRequested).toBe(false);

    source.cancel();
    expect(source.token.isCancellationRequested).toBe(true);
  });

  it('should notify listeners', () => {
    const source = new CancellationTokenSource();
    const listener = vi.fn();
    source.token.onCancellationRequested(listener);

    source.cancel();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('should throw on throwIfCancellationRequested', () => {
    const source = new CancellationTokenSource();
    source.cancel();
    expect(() => source.token.throwIfCancellationRequested()).toThrow('cancelled');
  });
});

describe('Stopwatch', () => {
  it('should measure elapsed time', () => {
    const sw = new Stopwatch().start();
    const elapsed = sw.stop();
    expect(elapsed).toBeGreaterThanOrEqual(0);
  });

  it('should support laps', () => {
    const sw = new Stopwatch().start();
    sw.lap('first');
    sw.lap('second');
    expect(sw.lapTimes).toHaveLength(2);
  });

  it('should support static measure', () => {
    const { result, elapsed } = Stopwatch.measure(() => 42);
    expect(result).toBe(42);
    expect(elapsed).toBeGreaterThanOrEqual(0);
  });
});

describe('Path Utils', () => {
  it('should normalize paths to forward slashes', () => {
    const result = normalizePath('a\\b\\c');
    expect(result).toBe('a/b/c');
  });

  it('should detect path traversal', () => {
    expect(isPathTraversal('../secret', '/project')).toBe(true);
    expect(isPathTraversal('safe/file.txt', '/project')).toBe(false);
  });

  it('should throw on path traversal in ensureRelativePath', () => {
    expect(() => ensureRelativePath('../../etc/passwd', '/project')).toThrow('traversal');
  });
});

describe('Validation', () => {
  it('isNonEmptyString', () => {
    expect(isNonEmptyString('hello')).toBe(true);
    expect(isNonEmptyString('')).toBe(false);
    expect(isNonEmptyString('  ')).toBe(false);
    expect(isNonEmptyString(42)).toBe(false);
  });

  it('isValidProjectName', () => {
    expect(isValidProjectName('MyProject')).toBe(true);
    expect(isValidProjectName('My Project 123')).toBe(true);
    expect(isValidProjectName('')).toBe(false);
    expect(isValidProjectName('.hidden')).toBe(false);
  });

  it('isValidVersion', () => {
    expect(isValidVersion('1.0.0')).toBe(true);
    expect(isValidVersion('1.2.3-beta.1')).toBe(true);
    expect(isValidVersion('invalid')).toBe(false);
  });

  it('validateRequired throws for null', () => {
    expect(() => validateRequired(null, 'field')).toThrow('field');
  });
});
