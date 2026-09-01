export type ScopeLevel = 'global' | 'suite' | 'scenario' | 'step';

export class ExecutionContext {
  private variables: Map<ScopeLevel, Map<string, unknown>> = new Map();
  public readonly startTime: number = Date.now();
  public duration?: number;

  constructor() {
    this.variables.set('global', new Map());
    this.variables.set('suite', new Map());
    this.variables.set('scenario', new Map());
    this.variables.set('step', new Map());
  }

  public setVariable(scope: ScopeLevel, key: string, value: unknown): void {
    this.variables.get(scope)?.set(key, value);
  }

  public getVariable<T>(key: string): T | undefined {
    // Resolve from narrowest scope to broadest
    const scopes: ScopeLevel[] = ['step', 'scenario', 'suite', 'global'];
    
    for (const scope of scopes) {
      const map = this.variables.get(scope);
      if (map?.has(key)) {
        return map.get(key) as T;
      }
    }
    
    return undefined;
  }

  public clearScope(scope: ScopeLevel): void {
    this.variables.get(scope)?.clear();
  }

  public serialize(): Record<string, Record<string, unknown>> {
    const data: Record<string, Record<string, unknown>> = {};
    for (const [scope, map] of this.variables.entries()) {
      data[scope] = Object.fromEntries(map.entries());
    }
    return data;
  }

  public deserialize(data: Record<string, Record<string, unknown>>): void {
    for (const [scope, record] of Object.entries(data)) {
      if (this.variables.has(scope as ScopeLevel)) {
        const map = this.variables.get(scope as ScopeLevel)!;
        for (const [k, v] of Object.entries(record)) {
          map.set(k, v);
        }
      }
    }
  }
}
