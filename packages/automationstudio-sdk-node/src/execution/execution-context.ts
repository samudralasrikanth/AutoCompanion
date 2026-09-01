export type ContextScope = 'global' | 'scenario' | 'flow' | 'step';

export interface IExecutionContext {
    scope: ContextScope;
    parent?: IExecutionContext;
    variables: Record<string, unknown>;
    
    get<T>(key: string): T | undefined;
    set(key: string, value: unknown): void;
    createChild(scope: ContextScope): IExecutionContext;
}

export interface ExecutionTransaction {
    id: string;
    signal?: AbortSignal;
}
