import { AutomationCommand, ExecutionResult, IAutomationBackend } from './automation-backend';
import { RetryEngine } from './retry-engine';
import { VerificationEngine } from './verification-engine';
import { DEFAULT_EXECUTION_POLICY } from './execution-policy';

export class ActionPipeline {
  constructor(private backend: IAutomationBackend) {}

  public async execute(command: AutomationCommand): Promise<ExecutionResult> {
    const policy = command.execution || DEFAULT_EXECUTION_POLICY;
    const signal = command.transaction?.signal;

    // 1. PreHooks / Telemetry (Emit ActionStarted)
    console.log(`[Telemetry] ActionStarted: ${command.action} (TxID: ${command.transaction?.id})`);

    // 2. Retry Engine wrapping Backend Execution
    const result = await RetryEngine.executeWithRetry(
      async () => {
        // Core execution
        const res = await this.backend.execute(command);
        if (!res.success) throw new Error(res.error || 'Backend execution failed');

        // 3. Verification Engine (If verification requested and not handled atomically by backend)
        // (Note: If backend did it atomically, verificationSuccess will be boolean, but let's assume we do TS-side verify here for robust checks)
        if (command.verification) {
          const verified = await VerificationEngine.verify(this.backend, command.verification, signal);
          res.verificationSuccess = verified;
          if (!verified) throw new Error('Verification failed');
        }

        return res;
      },
      policy,
      signal
    );

    // 4. PostHooks / Telemetry (Emit ActionFinished)
    console.log(`[Telemetry] ActionFinished: ${command.action} | Success: ${result.success} | Error: ${result.error}`);

    return result;
  }
}
