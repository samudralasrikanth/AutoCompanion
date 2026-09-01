/**
 * Project Manager - central project lifecycle management.
 */

import { mkdir, rm, cp, rename as fsRename } from 'node:fs/promises';
import { join, basename } from 'node:path';
import type {
  CreateProjectOptions,
  IProjectManifest,
  ILogger,
  IEventBus,
  RecentProject,
  UUID,
  Timestamp,
} from '@automation-studio/types';
import { createEvent } from '@automation-studio/events';
import {
  ProjectEvents,
  type ProjectCreatedPayload,
  type ProjectOpenedPayload,
  type ProjectClosedPayload,
  type ProjectDeletedPayload,
  type ProjectRenamedPayload,
} from '@automation-studio/events';
import { Stopwatch, generateUUID } from '@automation-studio/shared';
import { ProjectNotFoundError, ProjectAlreadyExistsError } from '../../errors/project-error';
import { createProjectStructure, createProjectGitignore, createProjectReadme } from './project-layout';
import {
  readProjectManifest,
  writeProjectManifest,
  writeWorkspaceManifest,
  writeSettingsManifest,
  writeEnvironmentsManifest,
  writePluginsManifest,
  writeReportsManifest,
  fileExists,
} from './project-persistence';
import { TemplateManager } from './template-manager';
import { ProjectValidator } from './project-validator';
import { ProjectIndexer } from './project-indexer';
import { RecentProjectsService } from './recent-projects-service';
import { MigrationManager } from './migration-manager';
import { PROJECT_FILES } from '@automation-studio/types';

export class ProjectManager {
  private currentProject: IProjectManifest | undefined;
  private currentProjectPath: string | undefined;
  private readonly templateManager: TemplateManager;
  private readonly validator: ProjectValidator;
  private readonly indexer: ProjectIndexer;

  constructor(
    private readonly eventBus: IEventBus,
    private readonly logger: ILogger,
    private readonly recentProjects: RecentProjectsService,
    private readonly migrationManager: MigrationManager,
  ) {
    this.templateManager = new TemplateManager();
    this.validator = new ProjectValidator();
    this.indexer = new ProjectIndexer(eventBus, logger.child('Indexer'));
  }

  public async create(options: CreateProjectOptions): Promise<IProjectManifest> {
    const stopwatch = new Stopwatch().start();
    const projectPath = join(options.location, options.name);

    this.logger.info(`Creating project: ${options.name}`, {
      template: options.template,
      technology: options.technology,
      path: projectPath,
    });

    // Check if directory already exists with a project
    if (await fileExists(join(projectPath, PROJECT_FILES.PROJECT_JSON))) {
      throw new ProjectAlreadyExistsError(projectPath);
    }

    // Create directory structure
    await mkdir(projectPath, { recursive: true });
    await createProjectStructure(projectPath);

    // Generate manifest files from template
    const manifests = this.templateManager.createManifests(options);

    // Write all manifest files
    await writeProjectManifest(projectPath, manifests.project);
    await writeWorkspaceManifest(projectPath, manifests.workspace);
    await writeSettingsManifest(projectPath, manifests.settings);
    await writeEnvironmentsManifest(projectPath, manifests.environments);
    await writePluginsManifest(projectPath, manifests.plugins);
    await writeReportsManifest(projectPath, manifests.reports);

    // Create .gitignore and README
    await createProjectGitignore(projectPath);
    await createProjectReadme(
      projectPath,
      options.name,
      options.description ?? manifests.project.description,
    );

    const duration = stopwatch.stop();

    this.eventBus.publish(
      createEvent<ProjectCreatedPayload>(ProjectEvents.ProjectCreated, {
        projectId: manifests.project.projectId,
        projectName: manifests.project.projectName,
        technology: manifests.project.technology,
        path: projectPath,
        template: options.template,
      }),
    );

    this.logger.info(`Project created in ${duration.toFixed(0)}ms: ${options.name}`);

    return manifests.project;
  }

  public async open(projectPath: string): Promise<IProjectManifest> {
    const stopwatch = new Stopwatch().start();
    this.logger.info(`Opening project: ${projectPath}`);

    const projectJsonPath = join(projectPath, PROJECT_FILES.PROJECT_JSON);
    if (!(await fileExists(projectJsonPath))) {
      throw new ProjectNotFoundError(projectPath);
    }

    // Keep projects created by older extension versions compatible with the
    // current layout. This is idempotent and only creates missing folders and
    // starter files; existing user files are never overwritten.
    await createProjectStructure(projectPath);

    // Read manifest
    const manifest = await readProjectManifest(projectPath);

    // Run migrations if needed
    await this.migrationManager.migrate(projectPath);

    // Validate
    const validation = await this.validator.validate(projectPath);
    if (!validation.valid) {
      this.logger.warn('Project validation found issues', {
        issues: validation.issues.length,
      });
    }

    // Build index
    await this.indexer.buildIndex(projectPath);

    this.currentProject = manifest;
    this.currentProjectPath = projectPath;

    // Add to recent projects
    await this.recentProjects.addRecentProject({
      projectId: manifest.projectId,
      projectName: manifest.projectName,
      projectPath,
      technology: manifest.technology,
      lastOpened: Date.now() as Timestamp,
    });

    const duration = stopwatch.stop();

    this.eventBus.publish(
      createEvent<ProjectOpenedPayload>(ProjectEvents.ProjectOpened, {
        projectId: manifest.projectId,
        projectName: manifest.projectName,
        path: projectPath,
        technology: manifest.technology,
      }),
    );

    this.logger.info(`Project opened in ${duration.toFixed(0)}ms: ${manifest.projectName}`);

    return manifest;
  }

  public async close(): Promise<void> {
    if (!this.currentProject || !this.currentProjectPath) {
      return;
    }

    this.logger.info(`Closing project: ${this.currentProject.projectName}`);

    this.eventBus.publish(
      createEvent<ProjectClosedPayload>(ProjectEvents.ProjectClosed, {
        projectId: this.currentProject.projectId,
        projectName: this.currentProject.projectName,
      }),
    );

    this.currentProject = undefined;
    this.currentProjectPath = undefined;
  }

  public async delete(projectPath: string): Promise<void> {
    this.logger.info(`Deleting project: ${projectPath}`);

    if (!(await fileExists(join(projectPath, PROJECT_FILES.PROJECT_JSON)))) {
      throw new ProjectNotFoundError(projectPath);
    }

    const manifest = await readProjectManifest(projectPath);
    await rm(projectPath, { recursive: true, force: true });
    await this.recentProjects.removeRecentProject(projectPath);

    this.eventBus.publish(
      createEvent<ProjectDeletedPayload>(ProjectEvents.ProjectDeleted, {
        projectId: manifest.projectId,
        path: projectPath,
      }),
    );

    this.logger.info(`Project deleted: ${projectPath}`);
  }

  public async rename(projectPath: string, newName: string): Promise<void> {
    this.logger.info(`Renaming project at '${projectPath}' to '${newName}'`);

    const manifest = await readProjectManifest(projectPath);
    const oldName = manifest.projectName;

    const updatedManifest: IProjectManifest = {
      ...manifest,
      projectName: newName,
      modifiedOn: Date.now() as Timestamp,
    };

    await writeProjectManifest(projectPath, updatedManifest);

    this.eventBus.publish(
      createEvent<ProjectRenamedPayload>(ProjectEvents.ProjectRenamed, {
        projectId: manifest.projectId,
        oldName,
        newName,
      }),
    );
  }

  public async clone(projectPath: string, destination: string): Promise<IProjectManifest> {
    this.logger.info(`Cloning project from '${projectPath}' to '${destination}'`);

    await cp(projectPath, destination, { recursive: true });

    // Generate new project ID
    const manifest = await readProjectManifest(destination);
    const clonedManifest: IProjectManifest = {
      ...manifest,
      projectId: generateUUID() as UUID,
      projectName: `${manifest.projectName} (Copy)`,
      createdOn: Date.now() as Timestamp,
      modifiedOn: Date.now() as Timestamp,
    };

    await writeProjectManifest(destination, clonedManifest);

    return clonedManifest;
  }

  public getCurrentProject(): IProjectManifest | undefined {
    return this.currentProject;
  }

  public getCurrentProjectPath(): string | undefined {
    return this.currentProjectPath;
  }

  public getTemplateManager(): TemplateManager {
    return this.templateManager;
  }

  public getValidator(): ProjectValidator {
    return this.validator;
  }

  public getIndexer(): ProjectIndexer {
    return this.indexer;
  }
}
