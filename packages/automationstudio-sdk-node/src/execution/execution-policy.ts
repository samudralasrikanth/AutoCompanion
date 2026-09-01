export interface ExecutionPolicy {
  retries: number;
  timeout?: number;
  confidenceThreshold: number;
  waitAfter: number;
  onFailure: 'heal' | 'abort' | 'continue' | 'fail';
  retryStrategy: 'fixed' | 'linear' | 'exponential' | 'adaptive';
}

export const DEFAULT_EXECUTION_POLICY: ExecutionPolicy = {
  retries: 3,
  timeout: 15000,
  confidenceThreshold: 80,
  waitAfter: 0,
  onFailure: 'abort',
  retryStrategy: 'exponential'
};
