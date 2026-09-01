/**
 * Recent Projects Service - MRU list stored in global state.
 */

import type { RecentProject, ILogger, UUID, Timestamp } from '@automation-studio/types';
import { fileExists } from './project-persistence';
import { join } from 'node:path';
import { PROJECT_FILES } from '@automation-studio/types';

const RECENT_PROJECTS_KEY = 'automation-studio.recentProjects';
const MAX_RECENT_PROJECTS = 20;

export class RecentProjectsService {
  private cachedProjects: RecentProject[] = [];

  constructor(
    private readonly globalState: {
      get<T>(key: string, defaultValue: T): T;
      update(key: string, value: unknown): Thenable<void>;
    },
    private readonly logger: ILogger,
  ) {}

  public async initialize(): Promise<void> {
    this.cachedProjects = [...await this.getRecentProjects()];
  }

  public getCachedProjects(): ReadonlyArray<RecentProject> {
    return this.cachedProjects;
  }

  public async getRecentProjects(): Promise<ReadonlyArray<RecentProject>> {
    const projects = this.globalState.get<RecentProject[]>(RECENT_PROJECTS_KEY, []);

    // Filter out projects that no longer exist
    const valid: RecentProject[] = [];
    for (const project of projects) {
      const exists = await fileExists(join(project.projectPath, PROJECT_FILES.PROJECT_JSON));
      if (exists) {
        valid.push(project);
      } else {
        this.logger.debug(`Removing non-existent recent project: ${project.projectPath}`);
      }
    }

    if (valid.length !== projects.length) {
      await this.globalState.update(RECENT_PROJECTS_KEY, valid);
    }

    return valid;
  }

  public async addRecentProject(project: RecentProject): Promise<void> {
    const projects = this.globalState.get<RecentProject[]>(RECENT_PROJECTS_KEY, []);

    // Remove existing entry for same path
    const filtered = projects.filter((p) => p.projectPath !== project.projectPath);

    // Add to front
    filtered.unshift(project);

    // Trim to max size
    const trimmed = filtered.slice(0, MAX_RECENT_PROJECTS);

    await this.globalState.update(RECENT_PROJECTS_KEY, trimmed);
    this.cachedProjects = [...trimmed];
    this.logger.debug(`Added to recent projects: ${project.projectName}`);
  }

  public async removeRecentProject(projectPath: string): Promise<void> {
    const projects = this.globalState.get<RecentProject[]>(RECENT_PROJECTS_KEY, []);
    const filtered = projects.filter((p) => p.projectPath !== projectPath);
    await this.globalState.update(RECENT_PROJECTS_KEY, filtered);
    this.cachedProjects = [...filtered];
  }

  public async clearRecentProjects(): Promise<void> {
    await this.globalState.update(RECENT_PROJECTS_KEY, []);
    this.cachedProjects = [];
  }
}
