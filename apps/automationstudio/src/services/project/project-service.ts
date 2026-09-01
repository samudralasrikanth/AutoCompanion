import type * as vscode from 'vscode';
import type { IProjectService, IEventBus, ILogger, HealthStatus, ServiceHealth } from '@automation-studio/types';
import { ProjectManager } from './project-manager';
import { RecentProjectsService } from './recent-projects-service';
import { MigrationManager } from './migration-manager';

export class ProjectService implements IProjectService {
  public readonly serviceName = 'ProjectService';
  public readonly manager: ProjectManager;
  public readonly recentProjects: RecentProjectsService;
  public readonly migrationManager: MigrationManager;

  constructor(
    private readonly eventBus: IEventBus,
    private readonly logger: ILogger,
    globalState: vscode.ExtensionContext['globalState']
  ) {
    this.recentProjects = new RecentProjectsService(globalState, logger.child('RecentProjects'));
    this.migrationManager = new MigrationManager(eventBus, logger.child('Migration'));
    this.manager = new ProjectManager(eventBus, logger.child('Manager'), this.recentProjects, this.migrationManager);
  }

  public async initialize(): Promise<void> {
    await this.recentProjects.initialize();
    this.logger.info('ProjectService initialized');
  }

  public health(): ServiceHealth {
    return {
      status: 'healthy' as HealthStatus.Healthy,
      message: 'Project service is operating normally',
    };
  }

  public version(): string {
    return '0.1.0';
  }

  public async dispose(): Promise<void> {
    await this.manager.close();
  }
}
