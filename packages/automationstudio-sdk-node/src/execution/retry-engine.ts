import { ExecutionPolicy } from './execution-policy';
import { ExecutionResult } from './automation-backend';

export class RetryEngine {
  
  static async executeWithRetry(
    operation: () => Promise<ExecutionResult>,
    policy: ExecutionPolicy,
    signal?: AbortSignal
  ): Promise<ExecutionResult> {
    
    let attempts = 0;
    const maxAttempts = policy.retries + 1;
    let lastResult: ExecutionResult = { success: false, error: 'Not started' };

    while (attempts < maxAttempts) {
      if (signal?.aborted) {
        return { success: false, error: 'Aborted via signal' };
      }

      attempts++;
      try {
        lastResult = await operation();
        
        // If it's a vision backend, check confidence threshold
        if (lastResult.success) {
          const confidence = lastResult.match?.confidence;
          if (confidence !== undefined && confidence < policy.confidenceThreshold) {
            lastResult.success = false;
            lastResult.error = `Confidence ${confidence} below threshold ${policy.confidenceThreshold}`;
          }
        }

        // If verification fails, we might retry
        if (lastResult.success && lastResult.verificationSuccess === false) {
           lastResult.success = false;
           lastResult.error = 'Verification failed';
        }

        if (lastResult.success) {
          if (policy.waitAfter > 0) {
            await this.sleep(policy.waitAfter, signal);
          }
          return lastResult; // Succeeded!
        }
      } catch (err: any) {
        lastResult = { success: false, error: err.message };
      }

      // Prepare for retry
      if (attempts < maxAttempts) {
        const delayMs = this.calculateDelay(attempts, policy.retryStrategy);
        await this.sleep(delayMs, signal);
      }
    }

    // Exceeded retries, check if we should heal
    if (policy.onFailure === 'heal') {
       lastResult.error = `${lastResult.error} (Triggering AI Healing...)`;
    }

    return lastResult;
  }

  private static calculateDelay(attempt: number, strategy: string): number {
    const baseDelay = 1000;
    switch (strategy) {
      case 'linear':
        return baseDelay * attempt;
      case 'exponential':
        return baseDelay * Math.pow(2, attempt - 1);
      case 'fixed':
      default:
        return baseDelay;
    }
  }

  private static sleep(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve) => {
      if (signal?.aborted) return resolve();
      
      const timeoutId = setTimeout(() => {
        if (signal) signal.removeEventListener('abort', onAbort);
        resolve();
      }, ms);

      const onAbort = () => {
        clearTimeout(timeoutId);
        resolve();
      };

      if (signal) {
        signal.addEventListener('abort', onAbort);
      }
    });
  }
}
