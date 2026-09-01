import { AutomationCommand, IAutomationBackend, VerifyOptions } from './automation-backend';

export class VerificationEngine {
  static async verify(
    backend: IAutomationBackend,
    verifyOptions: VerifyOptions,
    signal?: AbortSignal
  ): Promise<boolean> {
    const timeout = verifyOptions.timeout || 10000;
    const deadline = Date.now() + timeout;

    while (Date.now() < deadline) {
      if (signal?.aborted) return false;

      // Construct a generic command for verification
      const verifyCommand: AutomationCommand = {
        action: 'exists',
        locator: verifyOptions.value ? { strategies: [{ type: 'text', value: verifyOptions.value }] } : {},
      };
      
      try {
        const res = await backend.execute(verifyCommand);
        const exists = res.success;

        switch (verifyOptions.condition) {
          case 'exists':
          case 'appears':
            if (exists) return true;
            break;
          case 'disappears':
            if (!exists) return true;
            break;
          case 'text':
            if (exists && res.match?.metadata?.text?.includes(verifyOptions.value)) return true;
            break;
        }
      } catch (e) {
         // Ignore and retry
      }

      await this.sleep(500, signal);
    }
    
    return false; // Timed out
  }

  private static sleep(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve) => {
      if (signal?.aborted) return resolve();
      const id = setTimeout(resolve, ms);
      signal?.addEventListener('abort', () => {
        clearTimeout(id);
        resolve();
      });
    });
  }
}
