/**
 * Retry utility with exponential backoff and jitter.
 */

export interface RetryOptions {
  readonly maxAttempts: number;
  readonly baseDelay: number;
  readonly maxDelay: number;
  readonly jitter: boolean;
  readonly signal?: AbortSignal;
  readonly shouldRetry?: (error: Error) => boolean;
  readonly onRetry?: (attempt: number, error: Error, delay: number) => void;
}

const DEFAULT_OPTIONS: RetryOptions = {
  maxAttempts: 3,
  baseDelay: 1000,
  maxDelay: 30000,
  jitter: true,
};

export async function retry<T>(
  fn: () => Promise<T>,
  options?: Partial<RetryOptions>,
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    if (opts.signal?.aborted) {
      throw new Error('Retry aborted');
    }

    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt === opts.maxAttempts) {
        break;
      }

      if (opts.shouldRetry && !opts.shouldRetry(lastError)) {
        break;
      }

      const delay = calculateDelay(attempt, opts.baseDelay, opts.maxDelay, opts.jitter);

      opts.onRetry?.(attempt, lastError, delay);

      await sleep(delay, opts.signal);
    }
  }

  throw lastError;
}

function calculateDelay(
  attempt: number,
  baseDelay: number,
  maxDelay: number,
  jitter: boolean,
): number {
  const exponentialDelay = baseDelay * Math.pow(2, attempt - 1);
  const cappedDelay = Math.min(exponentialDelay, maxDelay);

  if (jitter) {
    return cappedDelay * (0.5 + Math.random() * 0.5);
  }

  return cappedDelay;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);

    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new Error('Retry aborted'));
    }, { once: true });
  });
}
