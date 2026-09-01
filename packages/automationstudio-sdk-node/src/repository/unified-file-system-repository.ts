import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import type { ScenarioMode } from '../scenario/scenario-ir';
import { objectIdToUri, objectUriToId, type IObjectResolver, type ResolvedLocator, type UnifiedObject } from './unified-object';

export class UnifiedFileSystemObjectRepository implements IObjectResolver {
  private readonly repositoryPath: string;

  constructor(projectPath: string) {
    this.repositoryPath = join(projectPath, 'automation', 'object-repository');
  }

  public async save(object: UnifiedObject, updatedBy = 'Automation Studio', changes = 'Updated object'): Promise<void> {
    const id = objectUriToId(objectIdToUri(object.id));
    const filePath = join(this.repositoryPath, `${id}.object.json`);
    await fs.mkdir(this.repositoryPath, { recursive: true });
    let previous: UnifiedObject | undefined;
    try { previous = JSON.parse(await fs.readFile(filePath, 'utf8')) as UnifiedObject; } catch { /* new object */ }
    const now = Date.now();
    const next: UnifiedObject = {
      ...object,
      id,
      version: previous ? previous.version + 1 : Math.max(1, object.version || 1),
      versionHistory: previous
        ? [...(previous.versionHistory || []), { version: previous.version, updatedAt: previous.updatedAt, updatedBy, changes }]
        : object.versionHistory || [],
      createdAt: previous?.createdAt || object.createdAt || now,
      updatedAt: now,
    };
    await fs.writeFile(filePath, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  }

  public async getObject(uri: string): Promise<UnifiedObject | undefined> {
    const id = objectUriToId(uri);
    try { return JSON.parse(await fs.readFile(join(this.repositoryPath, `${id}.object.json`), 'utf8')) as UnifiedObject; }
    catch { return undefined; }
  }

  public async resolve(uri: string, mode: ScenarioMode): Promise<ResolvedLocator> {
    const object = await this.getObject(uri);
    if (!object) throw new Error(`Object not found: ${uri}`);
    if (mode === 'playwright' && !object.pw) throw new Error(`Object ${uri} has no Playwright locator.`);
    if (mode === 'surface' && !object.surface?.length) throw new Error(`Object ${uri} has no Surface locator.`);
    return { pw: object.pw, surface: object.surface, objectType: object.type };
  }

  public async list(): Promise<string[]> {
    try {
      const entries = await fs.readdir(this.repositoryPath, { withFileTypes: true });
      return entries.filter((entry) => entry.isFile() && entry.name.endsWith('.object.json'))
        .map((entry) => objectIdToUri(entry.name.slice(0, -'.object.json'.length))).sort();
    } catch { return []; }
  }
}
