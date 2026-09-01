import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it, afterEach } from 'vitest';
import { SecretManager } from '../engine/secret-manager';
import { TestDataProvider } from '../engine/data-provider';
import { UnifiedFileSystemObjectRepository } from '@automation-studio/sdk';

const cleanups: string[] = [];
afterEach(async () => {
  while (cleanups.length) await rm(cleanups.pop()!, { recursive: true, force: true });
});

describe('reference services', () => {
  it('stores and resolves hidden secrets without exposing values in the index', async () => {
    const values = new Map<string, string>();
    const storage = {
      get: async (key: string) => values.get(key),
      store: async (key: string, value: string) => { values.set(key, value); },
      delete: async (key: string) => { values.delete(key); },
      onDidChange: () => ({ dispose: () => undefined }),
    } as any;
    const state = {
      get: (_key: string, fallback: string[]) => fallback,
      update: async () => undefined,
    } as any;
    const manager = new SecretManager(storage, state);
    await manager.store('secret://app.password', 'hidden-value');
    expect(await manager.resolve('secret://app.password')).toBe('hidden-value');
    expect(manager.toEnvVarName('secret://app.password')).toBe('AS_SECRET_APP_PASSWORD');
    expect(manager.redactText('value=hidden-value')).toBe('value=[REDACTED]');
  });

  it('loads nested test data through data URIs', async () => {
    const project = await mkdtemp(join(tmpdir(), 'automationstudio-data-'));
    cleanups.push(project);
    await mkdir(join(project, 'automation', 'testdata'), { recursive: true });
    await writeFile(join(project, 'automation', 'testdata', 'testdata.json'), JSON.stringify({ login: { user: 'qa-user' }, retries: 2 }));
    const provider = new TestDataProvider();
    await provider.load(project);
    expect(provider.resolve('data://login.user')).toBe('qa-user');
    expect(provider.resolve('data://retries')).toBe(2);
  });

  it('persists unified objects and resolves the mode-specific locator', async () => {
    const project = await mkdtemp(join(tmpdir(), 'automationstudio-objects-'));
    cleanups.push(project);
    const repository = new UnifiedFileSystemObjectRepository(project);
    await repository.save({
      id: 'app.login.username', name: 'Username', type: 'textbox', version: 1,
      pw: { role: 'textbox', name: 'Username' },
      surface: [{ strategy: 'ocr', value: 'Username', priority: 10 }],
      createdAt: 0, updatedAt: 0,
    });
    const resolved = await repository.resolve('object://app.login.username', 'playwright');
    expect(resolved.pw?.role).toBe('textbox');
    expect((await repository.list())).toEqual(['object://app.login.username']);
    const saved = await readFile(join(project, 'automation', 'object-repository', 'app.login.username.object.json'), 'utf8');
    expect(saved).toContain('"version": 1');
  });
});
