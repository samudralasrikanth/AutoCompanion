/**
 * Configuration system types.
 * Supports layered configuration with Workspace > User > Default precedence.
 */

// ─── Configuration Scope ─────────────────────────────────────────────────────

export enum ConfigurationScope {
  Default = 'default',
  User = 'user',
  Workspace = 'workspace',
}

// ─── Configuration Change ────────────────────────────────────────────────────

export interface ConfigurationChangeEvent {
  readonly key: string;
  readonly oldValue: unknown;
  readonly newValue: unknown;
  readonly scope: ConfigurationScope;
}

// ─── Configuration Schema ────────────────────────────────────────────────────

export interface ConfigurationSchemaEntry {
  readonly key: string;
  readonly type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  readonly defaultValue: unknown;
  readonly description: string;
  readonly enum?: ReadonlyArray<string>;
  readonly scope: ConfigurationScope;
}

// ─── Configuration Provider ──────────────────────────────────────────────────

export interface IConfigurationProvider {
  get<T>(key: string): T | undefined;
  get<T>(key: string, defaultValue: T): T;

  set(key: string, value: unknown, scope?: ConfigurationScope): Promise<void>;

  has(key: string): boolean;

  getAll(): Record<string, unknown>;

  onChange(handler: (event: ConfigurationChangeEvent) => void): { dispose(): void };
}
