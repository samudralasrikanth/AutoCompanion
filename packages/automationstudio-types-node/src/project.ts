/**
 * Project system types (EPIC-0002).
 * Defines project manifests, templates, validation, migration, indexing.
 */

import type { UUID, Timestamp } from './common';

// ─── Project Technology ──────────────────────────────────────────────────────

export enum ProjectTechnology {
  Vision = 'vision',
  Desktop = 'desktop',
  Playwright = 'playwright',
  Mainframe = 'mainframe',
  Hybrid = 'hybrid',
  API = 'api',
}

// ─── Project Manifest ────────────────────────────────────────────────────────

export interface IGenerationProfile {
  readonly id: string;
  readonly name: string;
  readonly language: string;
  readonly framework: string;
  readonly outDir: string;
}


export interface IProjectManifest {
  readonly projectId: UUID;
  readonly projectName: string;
  readonly description: string;
  readonly technology: ProjectTechnology;
  readonly frameworkVersion: string;
  readonly schemaVersion: number;
  readonly createdBy: string;
  readonly createdOn: Timestamp;
  readonly modifiedOn: Timestamp;
  readonly generationProfiles?: ReadonlyArray<IGenerationProfile>;
}

// ─── Workspace Manifest ──────────────────────────────────────────────────────

export interface IWorkspaceManifest {
  readonly openedFiles: ReadonlyArray<string>;
  readonly activeFile?: string;
  readonly editorLayout?: EditorLayout;
  readonly expandedFolders: ReadonlyArray<string>;
  readonly breakpoints: ReadonlyArray<BreakpointInfo>;
}

export interface EditorLayout {
  readonly orientation: 'horizontal' | 'vertical';
  readonly groups: ReadonlyArray<EditorGroup>;
}

export interface EditorGroup {
  readonly size: number;
  readonly tabs: ReadonlyArray<string>;
  readonly activeTab?: string;
}

export interface BreakpointInfo {
  readonly file: string;
  readonly line: number;
  readonly enabled: boolean;
  readonly condition?: string;
}

// ─── Settings Manifest ───────────────────────────────────────────────────────

export interface ISettingsManifest {
  readonly pythonPath: string;
  readonly loggingLevel: string;
  readonly captureScreenshots: boolean;
  readonly autoOpenReports: boolean;
  readonly customSettings: Record<string, unknown>;
}

// ─── Environments Manifest ───────────────────────────────────────────────────

export interface IEnvironmentsManifest {
  readonly activeProfile: string;
  readonly profiles: ReadonlyArray<EnvironmentProfile>;
}

export interface EnvironmentProfile {
  readonly name: string;
  readonly description: string;
  readonly variables: Record<string, string>;
  readonly baseUrl?: string;
  readonly isDefault: boolean;
}

// ─── Plugins Manifest ────────────────────────────────────────────────────────

export interface IPluginsManifest {
  readonly installed: ReadonlyArray<InstalledPlugin>;
}

export interface InstalledPlugin {
  readonly id: string;
  readonly version: string;
  readonly enabled: boolean;
  readonly configuration?: Record<string, unknown>;
}

// ─── Reports Manifest ────────────────────────────────────────────────────────

export interface IReportsManifest {
  readonly defaultFormat: 'html' | 'junit' | 'json' | 'xray';
  readonly outputDirectory: string;
  readonly captureScreenshots: boolean;
  readonly captureVideo: boolean;
  readonly retentionDays: number;
}

// ─── Project Template ────────────────────────────────────────────────────────

export enum ProjectTemplateId {
  Blank = 'blank',
  Vision = 'vision',
  Desktop = 'desktop',
  Playwright = 'playwright',
  Mainframe = 'mainframe',
  Hybrid = 'hybrid',
  Enterprise = 'enterprise',
}

export interface IProjectTemplate {
  readonly id: ProjectTemplateId;
  readonly name: string;
  readonly description: string;
  readonly version: string;
  readonly technology: ProjectTechnology;
  readonly defaultSettings: ISettingsManifest;
  readonly defaultEnvironments: IEnvironmentsManifest;
  readonly defaultReports: IReportsManifest;
  readonly sampleFiles?: ReadonlyArray<SampleFile>;
}

export interface SampleFile {
  readonly relativePath: string;
  readonly content: string;
}

// ─── Project Validation ──────────────────────────────────────────────────────

export enum ValidationSeverity {
  Error = 'error',
  Warning = 'warning',
  Info = 'info',
}

export interface ValidationIssue {
  readonly severity: ValidationSeverity;
  readonly code: string;
  readonly message: string;
  readonly file?: string;
  readonly line?: number;
  readonly fix?: string;
}

export interface ValidationReport {
  readonly valid: boolean;
  readonly issues: ReadonlyArray<ValidationIssue>;
  readonly timestamp: Timestamp;
  readonly duration: number;
}

// ─── Project Migration ───────────────────────────────────────────────────────

export interface IProjectMigration {
  readonly fromVersion: number;
  readonly toVersion: number;
  readonly description: string;

  canMigrate(manifest: IProjectManifest): boolean;

  migrate(projectPath: string, manifest: IProjectManifest): Promise<MigrationResult>;

  rollback(projectPath: string, backup: string): Promise<void>;
}

export interface MigrationResult {
  readonly success: boolean;
  readonly fromVersion: number;
  readonly toVersion: number;
  readonly changes: ReadonlyArray<string>;
  readonly warnings: ReadonlyArray<string>;
  readonly backupPath: string;
}

// ─── Project Index ───────────────────────────────────────────────────────────

export enum IndexCategory {
  Script = 'script',
  Selector = 'selector',
  Object = 'object',
  Scenario = 'scenario',
  Report = 'report',
  Resource = 'resource',
  Plugin = 'plugin',
}

export interface IndexEntry {
  readonly path: string;
  readonly category: IndexCategory;
  readonly name: string;
  readonly size: number;
  readonly lastModified: Timestamp;
  readonly metadata?: Record<string, unknown>;
}

export interface ProjectIndex {
  readonly entries: ReadonlyArray<IndexEntry>;
  readonly totalFiles: number;
  readonly lastIndexed: Timestamp;
  readonly duration: number;
}

// ─── File Watch Events ───────────────────────────────────────────────────────

export enum FileChangeType {
  Created = 'created',
  Modified = 'modified',
  Deleted = 'deleted',
}

export interface FileChangeEvent {
  readonly type: FileChangeType;
  readonly path: string;
  readonly timestamp: Timestamp;
}

// ─── Recent Project ──────────────────────────────────────────────────────────

export interface RecentProject {
  readonly projectId: UUID;
  readonly projectName: string;
  readonly projectPath: string;
  readonly technology: ProjectTechnology;
  readonly lastOpened: Timestamp;
}

// ─── Create Project Options ──────────────────────────────────────────────────

export interface CreateProjectOptions {
  readonly name: string;
  readonly location: string;
  readonly template: ProjectTemplateId;
  readonly technology: ProjectTechnology;
  readonly description?: string;
  readonly author?: string;
}

// ─── Project Layout Constants ────────────────────────────────────────────────

export const PROJECT_FOLDERS = {
  ROOT_CONFIG: '.automationstudio',
  CACHE: '.cache',
  HISTORY: '.history',
  AI: '.ai',
  SETTINGS: '.settings',
  WORKSPACE: '.automationstudio/workspace',
  INDEXES: '.automationstudio/indexes',
  REPORTS: '.automationstudio/reports',
  
  AUTOMATION_SCENARIOS: 'automation/scenarios',
  AUTOMATION_OBJECT_REPOSITORY: 'automation/object-repository',
  AUTOMATION_ACTIONS: 'automation/actions',
  AUTOMATION_TESTDATA: 'automation/testdata',
  AUTOMATION_FRAMEWORKS: 'automation/frameworks',
  AUTOMATION_SELECTORS: 'automation/selectors',
  AUTOMATION_KEYWORDS: 'automation/keywords',
  
  DATA_TESTDATA: 'data/testdata',
  DATA_SQL: 'data/sql',
  DATA_API: 'data/api',
  
  ARTIFACTS_SCREENSHOTS: 'artifacts/screenshots',
  ARTIFACTS_VIDEOS: 'artifacts/videos',
  ARTIFACTS_LOGS: 'artifacts/logs',
  /** @deprecated Reports are stored internally under REPORTS. */
  ARTIFACTS_REPORTS: '.automationstudio/reports',
  
  RESOURCES_IMAGES: 'resources/images',
  RESOURCES_DOCUMENTS: 'resources/documents',
  
  GENERATED: 'generated',
  CONFIG: 'config',
} as const;

export const PROJECT_FILES = {
  PROJECT_JSON: 'project.json',
  WORKSPACE_JSON: 'workspace.json',
  SETTINGS_JSON: 'config/settings.json',
  ENVIRONMENTS_JSON: 'config/environments.json',
  PLUGINS_JSON: 'config/plugins.json',
  REPORTS_JSON: 'config/reports.json',
  README: 'README.md',
  GITIGNORE: '.gitignore',
} as const;
