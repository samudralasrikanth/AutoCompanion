export interface IPCEvent<T = unknown> {
  type: string;
  payload: T;
  timestamp?: number;
}

export interface ScenarioFinishedPayload {
  status: 'passed' | 'failed' | 'skipped';
  duration: number;
}

export interface VariableUpdatedPayload {
  scope: 'global' | 'suite' | 'scenario' | 'step';
  key: string;
  value: unknown;
}

export interface StepStartedPayload {
  name: string;
  id?: string;
}

export interface StepFinishedPayload {
  name: string;
  id?: string;
  status: 'passed' | 'failed' | 'skipped';
  error?: string;
}
