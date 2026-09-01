import { IVisionLocator, MatchResult } from './vision-types';

export interface VerifyOptions {
  condition: 'exists' | 'disappears' | 'appears' | 'text' | 'image' | 'ocr';
  value?: string;
  timeout?: number;
}

export interface VisionCommand {
  action: 'click' | 'doubleClick' | 'rightClick' | 'hover' | 'drag' | 'type' | 'scroll' | 'pressKey' | 'wait' | 'exists';
  locator: IVisionLocator;
  targetLocator?: IVisionLocator; // For drag
  options?: Record<string, any>; // action-specific options like text, count, etc.
  retryPolicy?: any;
  timeout?: number;
  verification?: VerifyOptions;
}

export interface ExecutionResult {
  success: boolean;
  match?: MatchResult;
  verificationSuccess?: boolean;
  error?: string;
}

export interface IVisionExecutor {
  execute(command: VisionCommand): Promise<ExecutionResult>;
  
  // Convenience wrappers (optional, they just build and dispatch a VisionCommand)
  click(locator: IVisionLocator, options?: Record<string, any>): Promise<ExecutionResult>;
  type(locator: IVisionLocator, text: string, options?: Record<string, any>): Promise<ExecutionResult>;
  wait(locator: IVisionLocator, timeout?: number): Promise<ExecutionResult>;
}
