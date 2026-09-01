import { GenerationDiagnostic } from '@automation-studio/types';

export interface Traceability {
  testId?: string;
  stepId?: string;
  actionId?: string;
  repositoryObjectId?: string;
  sourceEventId?: string;
}

export interface LocatorReference {
  preferredLocator: { strategy: string; value: string };
  fallbackLocators: { strategy: string; value: string }[];
  resolutionPolicy?: 'strict' | 'fallback';
}

export interface BaseNode {
  kind: string;
  traceability?: Traceability;
}

export interface ActionNode extends BaseNode {
  kind: 'ActionNode';
  operation: string;
  target?: LocatorReference;
  arguments?: Record<string, unknown>;
  timeout?: number;
  retryPolicy?: { maxRetries: number; intervalMs?: number };
  waitPolicy?: 'none' | 'visible' | 'attached';
  failurePolicy?: 'abort' | 'ignore';
}

export interface AssertionNode extends BaseNode {
  kind: 'AssertionNode';
  target?: LocatorReference;
  assertionType: 'visible' | 'hidden' | 'text' | 'value' | 'attribute' | 'count';
  expectedValue?: unknown;
  timeout?: number;
}

export interface WaitNode extends BaseNode {
  kind: 'WaitNode';
  durationMs?: number;
  target?: LocatorReference;
  state?: 'visible' | 'hidden' | 'attached' | 'detached';
}

export interface NavigationNode extends BaseNode {
  kind: 'NavigationNode';
  url: string;
  timeout?: number;
  waitUntil?: 'load' | 'domcontentloaded' | 'networkidle';
}

export interface ControlFlowNode extends BaseNode {
  kind: 'ControlFlowNode';
  construct: 'if' | 'loop' | 'try-catch';
  children: IRNode[];
}

export interface CommentNode extends BaseNode {
  kind: 'CommentNode';
  text: string;
}

export type IRNode =
  | ActionNode
  | AssertionNode
  | WaitNode
  | NavigationNode
  | ControlFlowNode
  | CommentNode;
