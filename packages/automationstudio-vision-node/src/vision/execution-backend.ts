export type ExecutionBackendType = 'cpu' | 'gpu' | 'remote' | 'cloud';

export interface ExecutionBackend {
  type: ExecutionBackendType;
  name: string;
  capabilities: string[];   // e.g. ['opencv', 'cuda', 'tensorrt', 'onnx']
}
