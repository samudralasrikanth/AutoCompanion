/**
 * State management types.
 * Typed wrappers around VS Code workspace state, global state, and secret storage.
 */

// ─── State Scope ─────────────────────────────────────────────────────────────

export enum StateScope {
  Workspace = 'workspace',
  Global = 'global',
  Secret = 'secret',
}

// ─── State Manager ───────────────────────────────────────────────────────────

export interface IStateManager {
  get<T>(key: string, scope: StateScope): T | undefined;
  get<T>(key: string, scope: StateScope, defaultValue: T): T;

  set<T>(key: string, value: T, scope: StateScope): Promise<void>;

  delete(key: string, scope: StateScope): Promise<void>;

  has(key: string, scope: StateScope): boolean;

  keys(scope: StateScope): ReadonlyArray<string>;

  clear(scope: StateScope): Promise<void>;
}

// ─── Secret Storage ──────────────────────────────────────────────────────────

export interface ISecretStorage {
  get(key: string): Promise<string | undefined>;

  set(key: string, value: string): Promise<void>;

  delete(key: string): Promise<void>;

  onDidChange(handler: (key: string) => void): { dispose(): void };
}

// ─── State Migration ─────────────────────────────────────────────────────────

export interface MigrationDescriptor {
  readonly fromVersion: number;
  readonly toVersion: number;
  readonly description: string;
  readonly migrate: (data: Record<string, unknown>) => Record<string, unknown>;
}
