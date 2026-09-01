/**
 * Throttle utility.
 */

export function throttle<T extends (...args: unknown[]) => void>(
  fn: T,
  intervalMs: number,
): T & { cancel(): void } {
  let lastCall = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let lastArgs: unknown[] | undefined;

  const throttled = (...args: unknown[]): void => {
    const now = Date.now();
    const elapsed = now - lastCall;

    if (elapsed >= intervalMs) {
      lastCall = now;
      fn(...args);
    } else {
      lastArgs = args;
      if (timer === undefined) {
        timer = setTimeout(() => {
          lastCall = Date.now();
          timer = undefined;
          const currentArgs = lastArgs;
          lastArgs = undefined;
          if (currentArgs) {
            fn(...currentArgs);
          }
        }, intervalMs - elapsed);
      }
    }
  };

  throttled.cancel = (): void => {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
      lastArgs = undefined;
    }
  };

  return throttled as T & { cancel(): void };
}
