/**
 * Project Indexer - builds and maintains search indexes for project files.
 */

import { readdir, stat } from 'node:fs/promises';
import { join, extname, relative } from 'node:path';
import type {
  ProjectIndex,
  IndexEntry,
  ILogger,
  IEventBus,
} from '@automation-studio/types';
import { IndexCategory, type Timestamp } from '@automation-studio/types';
import { createEvent } from '@automation-studio/events';
import { ProjectEvents, type IndexUpdatedPayload } from '@automation-studio/events';
import { Stopwatch } from '@automation-studio/shared';

const CATEGORY_PATHS: Record<string, IndexCategory> = {
  'automation/scenarios': IndexCategory.Script,
  'automation/frameworks': IndexCategory.Script,
  'automation/selectors': IndexCategory.Selector,
  'automation/keywords': IndexCategory.Script,
  'resources/images': IndexCategory.Resource,
  'resources/documents': IndexCategory.Resource,
  '.automationstudio/reports': IndexCategory.Report,
  'config': IndexCategory.Plugin,
};

const IGNORED_DIRS = new Set([
  '.automationstudio',
  'node_modules',
  '.git',
  'temp',
  'logs',
]);

export class ProjectIndexer {
  private currentIndex: ProjectIndex | undefined;

  constructor(
    private readonly eventBus: IEventBus,
    private readonly logger: ILogger,
  ) {}

  public async buildIndex(projectPath: string): Promise<ProjectIndex> {
    const stopwatch = new Stopwatch().start();
    this.logger.info('Building project index...');

    this.eventBus.publish(createEvent(ProjectEvents.IndexingStarted, { projectPath }));

    const entries: IndexEntry[] = [];
    await this.walkDirectory(projectPath, projectPath, entries);

    const duration = stopwatch.stop();

    const index: ProjectIndex = {
      entries,
      totalFiles: entries.length,
      lastIndexed: Date.now() as Timestamp,
      duration,
    };

    this.currentIndex = index;

    // Emit index updated event
    const categories: Record<string, number> = {};
    for (const entry of entries) {
      const key = entry.category;
      categories[key] = (categories[key] ?? 0) + 1;
    }

    this.eventBus.publish(
      createEvent<IndexUpdatedPayload>(ProjectEvents.IndexUpdated, {
        totalFiles: entries.length,
        duration,
        categories,
      }),
    );

    this.logger.info(`Project index built: ${entries.length} files in ${duration.toFixed(0)}ms`);

    return index;
  }

  public getIndex(): ProjectIndex | undefined {
    return this.currentIndex;
  }

  public updateEntry(entry: IndexEntry): void {
    if (!this.currentIndex) {
      return;
    }

    const entries = [...this.currentIndex.entries];
    const existingIdx = entries.findIndex((e) => e.path === entry.path);

    if (existingIdx >= 0) {
      entries[existingIdx] = entry;
    } else {
      entries.push(entry);
    }

    this.currentIndex = {
      ...this.currentIndex,
      entries,
      totalFiles: entries.length,
      lastIndexed: Date.now() as Timestamp,
    };
  }

  public removeEntry(path: string): void {
    if (!this.currentIndex) {
      return;
    }

    const entries = this.currentIndex.entries.filter((e) => e.path !== path);
    this.currentIndex = {
      ...this.currentIndex,
      entries,
      totalFiles: entries.length,
      lastIndexed: Date.now() as Timestamp,
    };
  }

  public search(query: string): ReadonlyArray<IndexEntry> {
    if (!this.currentIndex) {
      return [];
    }
    const lowerQuery = query.toLowerCase();
    return this.currentIndex.entries.filter(
      (e) =>
        e.name.toLowerCase().includes(lowerQuery) ||
        e.path.toLowerCase().includes(lowerQuery),
    );
  }

  public getByCategory(category: IndexCategory): ReadonlyArray<IndexEntry> {
    if (!this.currentIndex) {
      return [];
    }
    return this.currentIndex.entries.filter((e) => e.category === category);
  }

  private async walkDirectory(
    basePath: string,
    currentPath: string,
    entries: IndexEntry[],
  ): Promise<void> {
    let items: string[];
    try {
      items = await readdir(currentPath);
    } catch {
      return;
    }

    for (const item of items) {
      if (IGNORED_DIRS.has(item)) {
        continue;
      }

      const fullPath = join(currentPath, item);
      let fileStat;
      try {
        fileStat = await stat(fullPath);
      } catch {
        continue;
      }

      if (fileStat.isDirectory()) {
        await this.walkDirectory(basePath, fullPath, entries);
      } else {
        const relativePath = relative(basePath, fullPath);
        const category = this.categorizeFile(relativePath);

        entries.push({
          path: relativePath,
          category,
          name: item,
          size: fileStat.size,
          lastModified: fileStat.mtimeMs as Timestamp,
        });
      }
    }
  }

  private categorizeFile(relativePath: string): IndexCategory {
    for (const [prefix, category] of Object.entries(CATEGORY_PATHS)) {
      if (relativePath.startsWith(prefix)) {
        return category;
      }
    }

    const ext = extname(relativePath).toLowerCase();
    if (ext === '.py' || ext === '.ts' || ext === '') {
      return IndexCategory.Script;
    }

    return IndexCategory.Resource;
  }
}
