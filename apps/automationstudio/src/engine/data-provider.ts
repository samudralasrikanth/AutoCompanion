import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import type { IDataResolver } from '@automation-studio/sdk';

export class TestDataProvider implements IDataResolver {
  private values = new Map<string, unknown>();

  public isDataUri(value: string): boolean {
    return typeof value === 'string' && /^data:\/\/[^\s]+$/.test(value);
  }

  public async load(projectPath: string): Promise<void> {
    const filePath = join(projectPath, 'automation', 'testdata', 'testdata.json');
    let raw: unknown;
    try { raw = JSON.parse(await fs.readFile(filePath, 'utf8')); }
    catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') { this.values.clear(); return; }
      throw new Error(`Could not read test data: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('testdata.json must contain a JSON object.');
    this.values.clear();
    this.flatten('', raw as Record<string, unknown>);
  }

  public resolve(uri: string): unknown {
    if (!this.isDataUri(uri)) throw new Error(`Invalid data URI: ${uri}`);
    const key = uri.slice('data://'.length);
    if (!this.values.has(key)) throw new Error(`Test data is not configured: ${uri}`);
    return this.values.get(key);
  }

  public list(): string[] {
    return [...this.values.keys()].map((key) => `data://${key}`).sort();
  }

  private flatten(prefix: string, value: Record<string, unknown>): void {
    for (const [key, child] of Object.entries(value)) {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      if (child && typeof child === 'object' && !Array.isArray(child)) this.flatten(fullKey, child as Record<string, unknown>);
      else this.values.set(fullKey, child);
    }
  }
}
