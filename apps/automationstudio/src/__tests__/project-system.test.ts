/**
 * Project System tests.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { TemplateManager } from '../services/project/template-manager';
import { ProjectValidator } from '../services/project/project-validator';
import { ProjectIndexer } from '../services/project/project-indexer';
import {
  writeProjectManifest,
  writeSettingsManifest,
  writeEnvironmentsManifest,
  readProjectManifest,
  fileExists,
} from '../services/project/project-persistence';
import { createProjectStructure, createProjectGitignore, createProjectReadme, MINIMAL_PROJECT_FOLDERS } from '../services/project/project-layout';
import { EventBus } from '@automation-studio/events';
import { Logger } from '@automation-studio/logger';
import { JsonSink } from '@automation-studio/logger';
import {
  ProjectTemplateId,
  ProjectTechnology,
  PROJECT_FILES,
  ValidationSeverity,
  LogLevel,
} from '@automation-studio/types';

describe('Project System', () => {
  let tempDir: string;
  let eventBus: EventBus;
  let logger: Logger;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'as-test-'));
    eventBus = new EventBus();
    logger = new Logger('Test', [new JsonSink()], { level: LogLevel.Debug });
  });

  afterEach(async () => {
    eventBus.dispose();
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('TemplateManager', () => {
    it('should return all templates', () => {
      const tm = new TemplateManager();
      const templates = tm.getAllTemplates();
      expect(templates.length).toBeGreaterThanOrEqual(7);
    });

    it('should create manifests from blank template', () => {
      const tm = new TemplateManager();
      const manifests = tm.createManifests({
        name: 'TestProject',
        location: tempDir,
        template: ProjectTemplateId.Blank,
        technology: ProjectTechnology.Desktop,
        description: 'A test project',
        author: 'Test User',
      });

      expect(manifests.project.projectName).toBe('TestProject');
      expect(manifests.project.technology).toBe(ProjectTechnology.Desktop);
      expect(manifests.project.schemaVersion).toBe(1);
      expect(manifests.project.createdBy).toBe('Test User');
      expect(manifests.settings.pythonPath).toBe('python');
      expect(manifests.environments.profiles).toHaveLength(1);
      expect(manifests.plugins.installed).toHaveLength(0);
    });

    it('should create manifests from each template type', () => {
      const tm = new TemplateManager();
      const templates = [
        ProjectTemplateId.Blank,
        ProjectTemplateId.Vision,
        ProjectTemplateId.Desktop,
        ProjectTemplateId.Playwright,
        ProjectTemplateId.Mainframe,
        ProjectTemplateId.Hybrid,
        ProjectTemplateId.Enterprise,
      ];

      for (const templateId of templates) {
        const manifests = tm.createManifests({
          name: `Test-${templateId}`,
          location: tempDir,
          template: templateId,
          technology: ProjectTechnology.Desktop,
        });

        expect(manifests.project.projectId).toBeTruthy();
        expect(manifests.project.projectName).toBe(`Test-${templateId}`);
      }
    });
  });

  describe('Project Layout', () => {
    it('should create all required folders', async () => {
      const projectPath = join(tempDir, 'layout-test');
      await createProjectStructure(projectPath);

      for (const folder of [...MINIMAL_PROJECT_FOLDERS, '.automationstudio/reports', '.automationstudio/cache']) {
        const exists = await fileExists(join(projectPath, folder));
        expect(exists, `Folder ${folder} should exist`).toBe(true);
      }
    });

    it('should create .gitignore', async () => {
      const projectPath = join(tempDir, 'gitignore-test');
      await createProjectStructure(projectPath);
      await createProjectGitignore(projectPath);

      const content = await readFile(join(projectPath, '.gitignore'), 'utf-8');
      expect(content).toContain('.automationstudio/cache');
      expect(content).toContain('temp/');
    });

    it('should create README', async () => {
      const projectPath = join(tempDir, 'readme-test');
      await createProjectStructure(projectPath);
      await createProjectReadme(projectPath, 'Test', 'A test project');

      const content = await readFile(join(projectPath, 'README.md'), 'utf-8');
      expect(content).toContain('# Test');
    });
  });

  describe('Project Persistence', () => {
    it('should round-trip project.json', async () => {
      const projectPath = join(tempDir, 'persist-test');
      await createProjectStructure(projectPath);

      const tm = new TemplateManager();
      const manifests = tm.createManifests({
        name: 'PersistTest',
        location: tempDir,
        template: ProjectTemplateId.Blank,
        technology: ProjectTechnology.Desktop,
      });

      await writeProjectManifest(projectPath, manifests.project);
      const loaded = await readProjectManifest(projectPath);

      expect(loaded.projectName).toBe('PersistTest');
      expect(loaded.projectId).toBe(manifests.project.projectId);
      expect(loaded.technology).toBe(ProjectTechnology.Desktop);
    });
  });

  describe('ProjectValidator', () => {
    it('should detect missing required files', async () => {
      const projectPath = join(tempDir, 'validate-test');
      await createProjectStructure(projectPath);
      // Don't create project.json

      const validator = new ProjectValidator();
      const report = await validator.validate(projectPath);

      expect(report.valid).toBe(false);
      expect(report.issues.some((i) => i.code === 'MISSING_FILE')).toBe(true);
    });

    it('should pass valid projects', async () => {
      const projectPath = join(tempDir, 'valid-test');
      await createProjectStructure(projectPath);

      const tm = new TemplateManager();
      const manifests = tm.createManifests({
        name: 'ValidProject',
        location: tempDir,
        template: ProjectTemplateId.Blank,
        technology: ProjectTechnology.Desktop,
      });

      await writeProjectManifest(projectPath, manifests.project);
      await writeSettingsManifest(projectPath, manifests.settings);
      await writeEnvironmentsManifest(projectPath, manifests.environments);

      const validator = new ProjectValidator();
      const report = await validator.validate(projectPath);

      expect(report.valid).toBe(true);
      expect(report.duration).toBeGreaterThan(0);
    });

    it('should detect invalid JSON', async () => {
      const projectPath = join(tempDir, 'invalid-json');
      await createProjectStructure(projectPath);

      const { writeFile } = await import('node:fs/promises');
      await writeFile(join(projectPath, PROJECT_FILES.PROJECT_JSON), '{ invalid }', 'utf-8');
      await writeSettingsManifest(projectPath, { pythonPath: 'python', loggingLevel: 'info', captureScreenshots: true, autoOpenReports: true, customSettings: {} });
      await writeEnvironmentsManifest(projectPath, { activeProfile: 'default', profiles: [{ name: 'default', description: '', variables: {}, isDefault: true }] });

      const validator = new ProjectValidator();
      const report = await validator.validate(projectPath);

      expect(report.issues.some((i) => i.code === 'INVALID_JSON')).toBe(true);
    });
  });

  describe('ProjectIndexer', () => {
    it('should build index from project directory', async () => {
      const projectPath = join(tempDir, 'index-test');
      await createProjectStructure(projectPath);

      // Create some test files
      const { writeFile } = await import('node:fs/promises');
      await writeFile(join(projectPath, 'automation', 'scenarios', 'test1.py'), '# test');
      await writeFile(join(projectPath, 'automation', 'scenarios', 'test2.py'), '# test');
      await writeFile(join(projectPath, 'data', 'testdata', 'data.csv'), 'a,b,c');

      const indexer = new ProjectIndexer(eventBus, logger);
      const index = await indexer.buildIndex(projectPath);

      expect(index.totalFiles).toBeGreaterThanOrEqual(3);
      expect(index.duration).toBeGreaterThan(0);
    });

    it('should support search', async () => {
      const projectPath = join(tempDir, 'search-test');
      await createProjectStructure(projectPath);

      const { writeFile } = await import('node:fs/promises');
      await writeFile(join(projectPath, 'automation', 'scenarios', 'login_test.py'), '# test');

      const indexer = new ProjectIndexer(eventBus, logger);
      await indexer.buildIndex(projectPath);

      const results = indexer.search('login');
      expect(results.length).toBeGreaterThanOrEqual(1);
    });

    it('should support incremental updates', async () => {
      const projectPath = join(tempDir, 'incremental-test');
      await createProjectStructure(projectPath);

      const indexer = new ProjectIndexer(eventBus, logger);
      await indexer.buildIndex(projectPath);

      const initialCount = indexer.getIndex()?.totalFiles ?? 0;

      indexer.updateEntry({
        path: 'automation/scenarios/new_test.py',
        category: 'script' as never,
        name: 'new_test.py',
        size: 100,
        lastModified: Date.now() as never,
      });

      expect(indexer.getIndex()?.totalFiles).toBe(initialCount + 1);
    });
  });
});
