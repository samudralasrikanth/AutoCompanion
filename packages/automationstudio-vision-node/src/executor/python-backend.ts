import { IAutomationBackend, AutomationCommand, ExecutionResult } from '@automation-studio/sdk/src/execution/automation-backend';
import { VisionEngine } from '../vision/vision-engine';

export class PythonBackend implements IAutomationBackend {
  constructor(private engine: VisionEngine) {}

  public async execute(command: AutomationCommand): Promise<ExecutionResult> {
    const result = await this.engine.serviceManager.execute(command);
    return result as ExecutionResult;
  }

  public async cancel(transactionId: string): Promise<void> {
    // Currently SidecarBridge does not support per-transaction cancellation
    // We can rely on AbortSignal in TS to stop polling, or implement a /cancel endpoint in sidecar later.
    console.warn(`[PythonBackend] Cancellation requested for tx: ${transactionId}`);
  }
}
