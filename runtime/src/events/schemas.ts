export interface ExecutionEvent<T = any> {
  version: '1.0';
  type: string;
  payload: T;
  metadata: {
    timestamp: number;
    source: string;
    runId?: string;
  };
}
