import type { ICardProvider, IQuickAction } from './workbench-types';
import type { IEnvironmentService } from './workbench-types';
import type { RecentProjectsService } from '../services/project/recent-projects-service';

export class EnvironmentCard implements ICardProvider {
  public readonly cardId = 'automationStudio.cards.environment';
  public readonly priority = 100;

  constructor(private readonly envService: IEnvironmentService) {}

  public renderHTML(): string {
    const status = this.envService.status;
    
    const renderItem = (name: string, isReady: boolean, isWarning = false) => {
      const icon = isReady ? 'pass icon-success' : (isWarning ? 'warning icon-warning' : 'error icon-error');
      return `<li><span class="codicon codicon-${icon}"></span> ${name}</li>`;
    };

    return `
      <h2><span class="codicon codicon-server-environment"></span> Environment Health</h2>
      <ul>
        ${renderItem('Python Interpreter', status.python)}
        ${renderItem('Node.js Environment', status.node)}
        ${renderItem('Git VCS', status.git)}
        ${renderItem('Playwright Engine', status.playwright, true)}
        ${renderItem('Bitwarden', status.bitwarden, true)}
        ${renderItem('AI Provider', status.ai)}
        ${renderItem('OCR Engine', status.ocr)}
      </ul>
    `;
  }
}

export class RecentProjectsCard implements ICardProvider {
  public readonly cardId = 'automationStudio.cards.recentProjects';
  public readonly priority = 90;

  constructor(private readonly service: RecentProjectsService) {}

  public renderHTML(): string {
    const projects = this.service.getCachedProjects();
    if (projects.length === 0) {
      return `
        <h2><span class="codicon codicon-history"></span> Recent Projects</h2>
        <div class="text-xs text-on-surface/50 p-2">No recent projects.</div>
      `;
    }

    const items = projects.map(p => {
      const escapedPath = p.projectPath.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
      return `<li>
        <a href="#" onclick="executeAction('automationStudio.project.open', '${escapedPath}')">
          <span class="codicon codicon-folder"></span> ${p.projectName}
        </a>
      </li>`;
    }).join('\n');

    return `
      <h2><span class="codicon codicon-history"></span> Recent Projects</h2>
      <ul>
        ${items}
      </ul>
    `;
  }
}

export class LatestReportCard implements ICardProvider {
  public readonly cardId = 'automationStudio.cards.latestReport';
  public readonly priority = 80;

  public renderHTML(): string {
    return `
      <h2><span class="codicon codicon-graph"></span> Latest Report</h2>
      <ul>
        <li><strong>Last Run:</strong> 2 hours ago</li>
        <li><strong>Pass Rate:</strong> 94% (45/48)</li>
        <li><strong>Duration:</strong> 12m 34s</li>
        <li style="margin-top: 10px;"><a href="#">View Full Report</a></li>
      </ul>
    `;
  }
}

export class NewsCard implements ICardProvider {
  public readonly cardId = 'automationStudio.cards.news';
  public readonly priority = 70;

  public renderHTML(): string {
    return `
      <h2><span class="codicon codicon-megaphone"></span> News & Updates</h2>
      <ul>
        <li><strong>Version:</strong> 0.1.0 (Alpha)</li>
        <li><a href="#">Browse Marketplace</a></li>
        <li><a href="#">Read Documentation</a></li>
        <li><a href="#">Submit Feedback</a></li>
      </ul>
    `;
  }
}

export const CORE_QUICK_ACTIONS: IQuickAction[] = [
  {
    id: 'automationStudio.quickAction.createProject',
    command: 'automationStudio.project.create',
    label: 'Create Project',
    iconId: 'add'
  },
  {
    id: 'automationStudio.quickAction.openProject',
    command: 'automationStudio.project.open',
    label: 'Open Project',
    iconId: 'folder-opened'
  },
  {
    id: 'automationStudio.quickAction.recentProjects',
    command: 'automationStudio.project.open', // Usually a different command, but mapped here for now
    label: 'Recent Projects',
    iconId: 'history'
  },
  {
    id: 'automationStudio.quickAction.docs',
    command: 'automationStudio.docs.open',
    label: 'Documentation',
    iconId: 'book'
  }
];
