import { IStep } from '../scenario/scenario-ir';

export interface BreakpointModel {
    enabled: boolean;
    condition?: string;
}

export type NodeStatus = 'pending' | 'queued' | 'running' | 'waiting' | 'paused' | 'succeeded' | 'failed' | 'skipped' | 'cancelled';

export type ExecutionPayload = 
  | { kind: 'step'; action: IStep }
  | { kind: 'condition'; expression: string }
  | { kind: 'loop'; type: 'while' | 'forEach' }
  | { kind: 'recovery'; action: IStep }
  | { kind: 'group'; name: string };

export interface ExecutionNode {
    id: string;
    payload: ExecutionPayload;
    status: NodeStatus;
    breakpoint?: BreakpointModel;
}

export interface ExecutionEdge {
    source: string;
    target: string;
    condition?: 'success' | 'failure' | 'always' | 'expression';
    priority?: number;
    expression?: string;
    timeout?: number;
    label?: string;
    metadata?: Record<string, unknown>;
}

export interface ExecutionGraph {
    nodes: ExecutionNode[];
    edges: ExecutionEdge[];
}

export interface ExecutionPlan {
    planId: string;
    executionId: string;
    scenarioId: string;
    compiledAt: number;
    compilerVersion: string;
    checksum: string;
    graph: ExecutionGraph;
    entryNodes: string[];
}
