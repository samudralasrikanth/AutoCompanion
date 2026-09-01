import type * as vscode from 'vscode';
import type { ISecretResolver } from '@automation-studio/sdk';

const SECRET_PREFIX = 'secret:';
const SECRET_INDEX_KEY = 'automationStudio.secretIndex';

export class SecretNotFoundError extends Error {
  public readonly code = 'SECRET_NOT_FOUND';

  constructor(public readonly uri: string) {
    super(`Secret is not configured: ${uri}`);
    this.name = 'SecretNotFoundError';
  }
}

export class SecretManager implements ISecretResolver {
  private readonly resolved = new Map<string, string>();

  constructor(
    private readonly storage: vscode.SecretStorage,
    private readonly workspaceState?: vscode.Memento,
  ) {}

  public isSecretUri(value: string): boolean {
    return typeof value === 'string' && /^secret:\/\/[^\s]+$/.test(value);
  }

  public toStorageKey(uri: string): string {
    this.assertUri(uri);
    return `${SECRET_PREFIX}${uri.slice('secret://'.length)}`;
  }

  public toEnvVarName(uri: string): string {
    this.assertUri(uri);
    const name = uri.slice('secret://'.length).replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').toUpperCase();
    return `AS_SECRET_${name}`;
  }

  public async resolve(uri: string): Promise<string> {
    const value = await this.storage.get(this.toStorageKey(uri));
    if (value === undefined) throw new SecretNotFoundError(uri);
    this.resolved.set(uri, value);
    return value;
  }

  public async store(uri: string, value: string): Promise<void> {
    this.assertUri(uri);
    if (!value) throw new Error(`Cannot store an empty secret: ${uri}`);
    await this.storage.store(this.toStorageKey(uri), value);
    this.resolved.set(uri, value);
    const current = new Set(this.workspaceState?.get<string[]>(SECRET_INDEX_KEY, []) || []);
    current.add(uri);
    await this.workspaceState?.update(SECRET_INDEX_KEY, [...current].sort());
  }

  public async delete(uri: string): Promise<void> {
    await this.storage.delete(this.toStorageKey(uri));
    this.resolved.delete(uri);
    const current = (this.workspaceState?.get<string[]>(SECRET_INDEX_KEY, []) || []).filter((item) => item !== uri);
    await this.workspaceState?.update(SECRET_INDEX_KEY, current);
  }

  public listUris(): string[] {
    return [...(this.workspaceState?.get<string[]>(SECRET_INDEX_KEY, []) || [])];
  }

  public redactText(text: string): string {
    let redacted = text;
    for (const value of this.resolved.values()) {
      if (value.length >= 3) redacted = redacted.split(value).join('[REDACTED]');
    }
    return redacted;
  }

  private assertUri(uri: string): void {
    if (!this.isSecretUri(uri)) throw new Error(`Invalid secret URI: ${uri}`);
  }
}
