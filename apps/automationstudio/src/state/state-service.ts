/**
 * State Service implementation.
 * Provides typed access to workspace state, global state, and secret storage.
 */

import type * as vscode from 'vscode';
import type { IStateService, ILogger } from '@automation-studio/types';
import { HealthStatus, StateScope, type ServiceHealth, type MigrationDescriptor } from '@automation-studio/types';

const STATE_VERSION_KEY = '__automation_studio_state_version__';

export class StateService implements IStateService {
  public readonly serviceName = 'StateService' as const;
  private initialized = false;
  private readonly migrations: MigrationDescriptor[] = [];

  constructor(
    private readonly workspaceState: vscode.Memento,
    private readonly globalState: vscode.Memento & { setKeysForSync(keys: string[]): void },
    private readonly secretStorage: vscode.SecretStorage,
    private readonly logger: ILogger,
  ) {}

  public async initialize(): Promise<void> {
    this.logger.info('Initializing StateService');
    await this.runMigrations();
    this.initialized = true;
    this.logger.info('StateService initialized');
  }

  public get<T>(key: string, scope: StateScope, defaultValue?: T): T | undefined {
    switch (scope) {
      case StateScope.Workspace:
        return this.workspaceState.get<T>(key, defaultValue as T) ?? defaultValue;
      case StateScope.Global:
        return this.globalState.get<T>(key, defaultValue as T) ?? defaultValue;
      case StateScope.Secret:
        throw new Error('Use getSecret() for secret storage');
    }
  }

  public async set<T>(key: string, value: T, scope: StateScope): Promise<void> {
    switch (scope) {
      case StateScope.Workspace:
        await this.workspaceState.update(key, value);
        break;
      case StateScope.Global:
        await this.globalState.update(key, value);
        break;
      case StateScope.Secret:
        if (typeof value === 'string') {
          await this.secretStorage.store(key, value);
        } else {
          throw new Error('Secret storage only supports string values');
        }
        break;
    }
  }

  public async delete(key: string, scope: StateScope): Promise<void> {
    switch (scope) {
      case StateScope.Workspace:
        await this.workspaceState.update(key, undefined);
        break;
      case StateScope.Global:
        await this.globalState.update(key, undefined);
        break;
      case StateScope.Secret:
        await this.secretStorage.delete(key);
        break;
    }
  }

  public has(key: string, scope: StateScope): boolean {
    switch (scope) {
      case StateScope.Workspace:
        return this.workspaceState.get(key) !== undefined;
      case StateScope.Global:
        return this.globalState.get(key) !== undefined;
      case StateScope.Secret:
        return false; // Secret storage doesn't support synchronous has()
    }
  }

  public keys(scope: StateScope): ReadonlyArray<string> {
    switch (scope) {
      case StateScope.Workspace:
        return this.workspaceState.keys();
      case StateScope.Global:
        return this.globalState.keys();
      case StateScope.Secret:
        return [];
    }
  }

  public async clear(scope: StateScope): Promise<void> {
    const keysToDelete = this.keys(scope).filter((k) => k !== STATE_VERSION_KEY);
    for (const key of keysToDelete) {
      await this.delete(key, scope);
    }
  }

  public async getSecret(key: string): Promise<string | undefined> {
    return this.secretStorage.get(key);
  }

  public async setSecret(key: string, value: string): Promise<void> {
    await this.secretStorage.store(key, value);
  }

  public async deleteSecret(key: string): Promise<void> {
    await this.secretStorage.delete(key);
  }

  public registerMigration(migration: MigrationDescriptor): void {
    this.migrations.push(migration);
    this.migrations.sort((a, b) => a.fromVersion - b.fromVersion);
  }

  public health(): ServiceHealth {
    return {
      status: this.initialized ? HealthStatus.Healthy : HealthStatus.Unhealthy,
      message: this.initialized ? 'State service is healthy' : 'Not initialized',
    };
  }

  public version(): string {
    return '0.1.0';
  }

  public async dispose(): Promise<void> {
    this.initialized = false;
  }

  private async runMigrations(): Promise<void> {
    const currentVersion = this.globalState.get<number>(STATE_VERSION_KEY, 0);
    let version = currentVersion;

    for (const migration of this.migrations) {
      if (migration.fromVersion === version) {
        this.logger.info(
          `Running state migration: v${migration.fromVersion} → v${migration.toVersion}`,
          { description: migration.description },
        );

        try {
          const data: Record<string, unknown> = {};
          for (const key of this.globalState.keys()) {
            data[key] = this.globalState.get(key);
          }

          const migrated = migration.migrate(data);

          for (const [key, value] of Object.entries(migrated)) {
            await this.globalState.update(key, value);
          }

          version = migration.toVersion;
          await this.globalState.update(STATE_VERSION_KEY, version);
        } catch (error) {
          this.logger.error(
            `State migration failed: v${migration.fromVersion} → v${migration.toVersion}`,
            error instanceof Error ? error : new Error(String(error)),
          );
          break;
        }
      }
    }
  }
}
