import { ExecutionPolicy } from './execution-policy';
import { ExecutionTransaction } from './execution-context';

export interface VerifyOptions {
  condition: 'exists' | 'disappears' | 'appears' | 'text' | 'image' | 'ocr' | 'state';
  value?: string;
  timeout?: number;
}

export interface AutomationCommand {
  action: string; // 'click', 'type', 'drag', etc.
  locator: any; // Opaque locator format (e.g. IVisionLocator for Vision, string selector for Web)
  targetLocator?: any; // For drag
  options?: Record<string, any>; 
  execution?: ExecutionPolicy;
  verification?: VerifyOptions;
  transaction?: ExecutionTransaction;
}

export interface ExecutionResult {
  success: boolean;
  match?: any; // e.g. MatchResult
  verificationSuccess?: boolean;
  error?: string;
  durationMs?: number;
}

export interface IAutomationBackend {
  execute(command: AutomationCommand): Promise<ExecutionResult>;
  cancel(transactionId: string): Promise<void>;
}
