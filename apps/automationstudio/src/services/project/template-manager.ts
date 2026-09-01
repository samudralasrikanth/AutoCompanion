/**
 * Template Manager - creates projects from versioned templates.
 */

import type {
  IProjectTemplate,
  IProjectManifest,
  ISettingsManifest,
  IEnvironmentsManifest,
  IPluginsManifest,
  IReportsManifest,
  IWorkspaceManifest,
  CreateProjectOptions,
} from '@automation-studio/types';
import { ProjectTemplateId, ProjectTechnology, type Timestamp, type UUID } from '@automation-studio/types';
import { generateUUID } from '@automation-studio/shared';
import { ProjectTemplateError } from '../../errors/project-error';

const BLANK_SETTINGS: ISettingsManifest = {
  pythonPath: 'python',
  loggingLevel: 'info',
  captureScreenshots: true,
  autoOpenReports: true,
  customSettings: {},
};

const BLANK_ENVIRONMENTS: IEnvironmentsManifest = {
  activeProfile: 'default',
  profiles: [
    {
      name: 'default',
      description: 'Default environment',
      variables: {},
      isDefault: true,
    },
  ],
};

const BLANK_REPORTS: IReportsManifest = {
  defaultFormat: 'html',
  outputDirectory: 'reports',
  captureScreenshots: true,
  captureVideo: false,
  retentionDays: 30,
};

const BLANK_WORKSPACE: IWorkspaceManifest = {
  openedFiles: [],
  expandedFolders: [],
  breakpoints: [],
};

const BLANK_PLUGINS: IPluginsManifest = {
  installed: [],
};

function createTemplate(
  id: ProjectTemplateId,
  name: string,
  description: string,
  technology: ProjectTechnology,
): IProjectTemplate {
  return {
    id,
    name,
    description,
    version: '1.0.0',
    technology,
    defaultSettings: { ...BLANK_SETTINGS },
    defaultEnvironments: { ...BLANK_ENVIRONMENTS },
    defaultReports: { ...BLANK_REPORTS },
  };
}

const TEMPLATES: ReadonlyArray<IProjectTemplate> = [
  createTemplate(
    ProjectTemplateId.Blank,
    'Blank Project',
    'Empty project with standard folder structure',
    ProjectTechnology.Desktop,
  ),
  createTemplate(
    ProjectTemplateId.Vision,
    'Vision Banking',
    'Pre-configured for Vision Virtual Apps automation',
    ProjectTechnology.Vision,
  ),
  createTemplate(
    ProjectTemplateId.Desktop,
    'Desktop ERP',
    'Pre-configured for desktop application automation using UIA',
    ProjectTechnology.Desktop,
  ),
  createTemplate(
    ProjectTemplateId.Playwright,
    'Playwright Web',
    'Pre-configured for web automation using Playwright',
    ProjectTechnology.Playwright,
  ),
  createTemplate(
    ProjectTemplateId.Mainframe,
    'Mainframe Core Banking',
    'Pre-configured for mainframe automation using EHLLAPI',
    ProjectTechnology.Mainframe,
  ),
  createTemplate(
    ProjectTemplateId.Hybrid,
    'Hybrid UI + API',
    'Combines UI automation with API testing',
    ProjectTechnology.Hybrid,
  ),
  createTemplate(
    ProjectTemplateId.Enterprise,
    'Enterprise',
    'Full enterprise setup with all technologies enabled',
    ProjectTechnology.Hybrid,
  ),
];

export class TemplateManager {
  public getTemplate(templateId: ProjectTemplateId): IProjectTemplate {
    const template = TEMPLATES.find((t) => t.id === templateId);
    if (!template) {
      throw new ProjectTemplateError(templateId, 'Template not found');
    }
    return template;
  }

  public getAllTemplates(): ReadonlyArray<IProjectTemplate> {
    return TEMPLATES;
  }

  public async checkDependencies(templateId: ProjectTemplateId): Promise<{ passed: boolean; missing: string[] }> {
    const template = this.getTemplate(templateId);
    const missing: string[] = [];

    // Framework Wizard dependency check simulation
    if (template.technology === ProjectTechnology.Playwright) {
      // e.g. check for Node.js
      // if (!(await exec('node -v'))) missing.push('Node.js');
    } else if (template.technology === ProjectTechnology.Desktop) {
      // e.g. check for Python or WinAppDriver
    }

    return { passed: missing.length === 0, missing };
  }

  public createManifests(options: CreateProjectOptions): {
    project: IProjectManifest;
    workspace: IWorkspaceManifest;
    settings: ISettingsManifest;
    environments: IEnvironmentsManifest;
    plugins: IPluginsManifest;
    reports: IReportsManifest;
  } {
    const template = this.getTemplate(options.template);
    const now = Date.now() as Timestamp;

    const project: IProjectManifest = {
      projectId: generateUUID() as UUID,
      projectName: options.name,
      description: options.description ?? template.description,
      technology: options.technology,
      frameworkVersion: '0.1.0',
      schemaVersion: 1,
      createdBy: options.author ?? 'Automation Studio',
      createdOn: now,
      modifiedOn: now,
    };

    return {
      project,
      workspace: { ...BLANK_WORKSPACE },
      settings: { ...template.defaultSettings },
      environments: {
        ...template.defaultEnvironments,
        profiles: template.defaultEnvironments.profiles.map((p) => ({ ...p })),
      },
      plugins: { ...BLANK_PLUGINS },
      reports: { ...template.defaultReports },
    };
  }
}
