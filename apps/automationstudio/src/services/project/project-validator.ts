/**
 * Project Validator - validates project structure and configuration.
 */

import { access, readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { IProjectManifest, ValidationReport, ValidationIssue } from '@automation-studio/types';
import {
  ValidationSeverity,
  PROJECT_FOLDERS,
  PROJECT_FILES,
  type Timestamp,
} from '@automation-studio/types';
import { Stopwatch } from '@automation-studio/shared';
import { MINIMAL_PROJECT_FOLDERS } from './project-layout';

export class ProjectValidator {
  public async validate(projectPath: string): Promise<ValidationReport> {
    const stopwatch = new Stopwatch().start();
    const issues: ValidationIssue[] = [];

    await this.validateRequiredFolders(projectPath, issues);
    await this.validateRequiredFiles(projectPath, issues);
    await this.validateProjectJson(projectPath, issues);
    await this.validateSettingsJson(projectPath, issues);
    await this.validateEnvironmentsJson(projectPath, issues);

    const duration = stopwatch.stop();
    const hasErrors = issues.some((i) => i.severity === ValidationSeverity.Error);

    return {
      valid: !hasErrors,
      issues,
      timestamp: Date.now() as Timestamp,
      duration,
    };
  }

  private async validateRequiredFolders(
    projectPath: string,
    issues: ValidationIssue[],
  ): Promise<void> {
    const requiredFolders = MINIMAL_PROJECT_FOLDERS;

    for (const folder of requiredFolders) {
      const folderPath = join(projectPath, folder);
      const exists = await this.exists(folderPath);
      if (!exists) {
        issues.push({
          severity: ValidationSeverity.Warning,
          code: 'MISSING_FOLDER',
          message: `Required folder missing: ${folder}`,
          file: folder,
          fix: `Create the folder: mkdir -p "${folder}"`,
        });
      }
    }
  }

  private async validateRequiredFiles(
    projectPath: string,
    issues: ValidationIssue[],
  ): Promise<void> {
    const requiredFiles = [
      PROJECT_FILES.PROJECT_JSON,
      PROJECT_FILES.SETTINGS_JSON,
      PROJECT_FILES.ENVIRONMENTS_JSON,
    ];

    for (const file of requiredFiles) {
      const filePath = join(projectPath, file);
      const exists = await this.exists(filePath);
      if (!exists) {
        issues.push({
          severity: ValidationSeverity.Error,
          code: 'MISSING_FILE',
          message: `Required file missing: ${file}`,
          file,
          fix: `Create the file or run project repair`,
        });
      }
    }
  }

  private async validateProjectJson(
    projectPath: string,
    issues: ValidationIssue[],
  ): Promise<void> {
    const filePath = join(projectPath, PROJECT_FILES.PROJECT_JSON);
    if (!(await this.exists(filePath))) {
      return;
    }

    try {
      const content = await readFile(filePath, 'utf-8');
      const manifest = JSON.parse(content) as Record<string, unknown>;

      const requiredFields = [
        'projectId',
        'projectName',
        'technology',
        'schemaVersion',
        'createdBy',
        'createdOn',
      ];

      for (const field of requiredFields) {
        if (!(field in manifest) || manifest[field] === undefined || manifest[field] === '') {
          issues.push({
            severity: ValidationSeverity.Error,
            code: 'MISSING_FIELD',
            message: `Required field missing in project.json: ${field}`,
            file: PROJECT_FILES.PROJECT_JSON,
            fix: `Add the '${field}' field to project.json`,
          });
        }
      }

      if (typeof manifest['projectName'] === 'string' && manifest['projectName'].length > 128) {
        issues.push({
          severity: ValidationSeverity.Error,
          code: 'INVALID_VALUE',
          message: 'Project name exceeds maximum length of 128 characters',
          file: PROJECT_FILES.PROJECT_JSON,
        });
      }
    } catch (error) {
      issues.push({
        severity: ValidationSeverity.Error,
        code: 'INVALID_JSON',
        message: `Invalid JSON in project.json: ${error instanceof Error ? error.message : String(error)}`,
        file: PROJECT_FILES.PROJECT_JSON,
        fix: 'Fix the JSON syntax in project.json',
      });
    }
  }

  private async validateSettingsJson(
    projectPath: string,
    issues: ValidationIssue[],
  ): Promise<void> {
    const filePath = join(projectPath, PROJECT_FILES.SETTINGS_JSON);
    if (!(await this.exists(filePath))) {
      return;
    }

    try {
      const content = await readFile(filePath, 'utf-8');
      JSON.parse(content);
    } catch {
      issues.push({
        severity: ValidationSeverity.Error,
        code: 'INVALID_JSON',
        message: 'Invalid JSON in settings.json',
        file: PROJECT_FILES.SETTINGS_JSON,
        fix: 'Fix the JSON syntax in settings.json',
      });
    }
  }

  private async validateEnvironmentsJson(
    projectPath: string,
    issues: ValidationIssue[],
  ): Promise<void> {
    const filePath = join(projectPath, PROJECT_FILES.ENVIRONMENTS_JSON);
    if (!(await this.exists(filePath))) {
      return;
    }

    try {
      const content = await readFile(filePath, 'utf-8');
      const manifest = JSON.parse(content) as Record<string, unknown>;

      if (!Array.isArray(manifest['profiles']) || manifest['profiles'].length === 0) {
        issues.push({
          severity: ValidationSeverity.Warning,
          code: 'NO_PROFILES',
          message: 'No environment profiles defined',
          file: PROJECT_FILES.ENVIRONMENTS_JSON,
          fix: 'Add at least one environment profile',
        });
      }
    } catch {
      issues.push({
        severity: ValidationSeverity.Error,
        code: 'INVALID_JSON',
        message: 'Invalid JSON in environments.json',
        file: PROJECT_FILES.ENVIRONMENTS_JSON,
      });
    }
  }

  private async exists(filePath: string): Promise<boolean> {
    try {
      await access(filePath);
      return true;
    } catch {
      return false;
    }
  }
}
