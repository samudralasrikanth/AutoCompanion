/**
 * Debounce utility.
 */

export function debounce<T extends (...args: any[]) => void>(
  fn: T,
  delayMs: number,
): T & { cancel(): void; flush(): void } {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let lastArgs: any[] | undefined;

  const debounced = (...args: any[]): void => {
    lastArgs = args;
    if (timer !== undefined) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      timer = undefined;
      const currentArgs = lastArgs;
      lastArgs = undefined;
      if (currentArgs) {
        fn(...currentArgs);
      }
    }, delayMs);
  };

  debounced.cancel = (): void => {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
      lastArgs = undefined;
    }
  };

  debounced.flush = (): void => {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
      const currentArgs = lastArgs;
      lastArgs = undefined;
      if (currentArgs) {
        fn(...currentArgs);
      }
    }
  };

  return debounced as T & { cancel(): void; flush(): void };
}
