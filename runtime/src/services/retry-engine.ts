import { ExecutionError } from '../errors';

export interface RetryOptions {
  maxAttempts: number;
  delayMs: number;
  backoffMultiplier?: number;
  exceptionFilter?: (error: Error) => boolean;
}

export class RetryEngine {
  public async execute<T>(action: () => Promise<T>, options: RetryOptions): Promise<T> {
    let attempts = 0;
    let currentDelay = options.delayMs;

    while (attempts < options.maxAttempts) {
      try {
        return await action();
      } catch (error) {
        attempts++;
        
        if (options.exceptionFilter && !options.exceptionFilter(error as Error)) {
          throw error;
        }

        if (attempts >= options.maxAttempts) {
          throw new ExecutionError(`Action failed after ${attempts} attempts`, { cause: error });
        }

        await this.sleep(currentDelay);
        
        if (options.backoffMultiplier) {
          currentDelay *= options.backoffMultiplier;
        }
      }
    }

    throw new ExecutionError('Retry loop exited unexpectedly');
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
