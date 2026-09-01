import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import type { IScenario } from '@automation-studio/sdk';
import type { IGenerationProfile } from '@automation-studio/types';

export class BuildCache {
  private cacheFilePath: string;

  constructor(workspaceRoot: string) {
    const cacheDir = path.join(workspaceRoot, '.automationstudio', '.cache');
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }
    this.cacheFilePath = path.join(cacheDir, 'build.json');
  }

  private readCache(): Record<string, string> {
    if (fs.existsSync(this.cacheFilePath)) {
      try {
        return JSON.parse(fs.readFileSync(this.cacheFilePath, 'utf8'));
      } catch (e) {
        return {};
      }
    }
    return {};
  }

  private writeCache(cache: Record<string, string>) {
    fs.writeFileSync(this.cacheFilePath, JSON.stringify(cache, null, 2));
  }

  public computeHash(scenario: IScenario, profile: IGenerationProfile): string {
    const data = JSON.stringify(scenario) + JSON.stringify(profile);
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  public isCached(scenarioId: string, currentHash: string): boolean {
    const cache = this.readCache();
    return cache[scenarioId] === currentHash;
  }

  public updateCache(scenarioId: string, newHash: string): void {
    const cache = this.readCache();
    cache[scenarioId] = newHash;
    this.writeCache(cache);
  }
}
