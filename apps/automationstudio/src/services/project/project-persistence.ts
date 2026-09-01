/**
 * Project persistence - reads and writes all manifest files atomically.
 */

import { readFile, writeFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import { PROJECT_FILES, type IProjectManifest, type IWorkspaceManifest, type ISettingsManifest, type IEnvironmentsManifest, type IPluginsManifest, type IReportsManifest } from '@automation-studio/types';

export async function readManifest<T>(projectPath: string, fileName: string): Promise<T> {
  const filePath = join(projectPath, fileName);
  const content = await readFile(filePath, 'utf-8');
  return JSON.parse(content) as T;
}

export async function writeManifest<T>(
  projectPath: string,
  fileName: string,
  data: T,
): Promise<void> {
  const filePath = join(projectPath, fileName);
  const content = JSON.stringify(data, null, 2) + '\n';
  await writeFile(filePath, content, 'utf-8');
}

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function readProjectManifest(projectPath: string): Promise<IProjectManifest> {
  return readManifest<IProjectManifest>(projectPath, PROJECT_FILES.PROJECT_JSON);
}

export async function writeProjectManifest(
  projectPath: string,
  manifest: IProjectManifest,
): Promise<void> {
  return writeManifest(projectPath, PROJECT_FILES.PROJECT_JSON, manifest);
}

export async function readWorkspaceManifest(projectPath: string): Promise<IWorkspaceManifest> {
  return readManifest<IWorkspaceManifest>(projectPath, PROJECT_FILES.WORKSPACE_JSON);
}

export async function writeWorkspaceManifest(
  projectPath: string,
  manifest: IWorkspaceManifest,
): Promise<void> {
  return writeManifest(projectPath, PROJECT_FILES.WORKSPACE_JSON, manifest);
}

export async function readSettingsManifest(projectPath: string): Promise<ISettingsManifest> {
  return readManifest<ISettingsManifest>(projectPath, PROJECT_FILES.SETTINGS_JSON);
}

export async function writeSettingsManifest(
  projectPath: string,
  manifest: ISettingsManifest,
): Promise<void> {
  return writeManifest(projectPath, PROJECT_FILES.SETTINGS_JSON, manifest);
}

export async function readEnvironmentsManifest(
  projectPath: string,
): Promise<IEnvironmentsManifest> {
  return readManifest<IEnvironmentsManifest>(projectPath, PROJECT_FILES.ENVIRONMENTS_JSON);
}

export async function writeEnvironmentsManifest(
  projectPath: string,
  manifest: IEnvironmentsManifest,
): Promise<void> {
  return writeManifest(projectPath, PROJECT_FILES.ENVIRONMENTS_JSON, manifest);
}

export async function readPluginsManifest(projectPath: string): Promise<IPluginsManifest> {
  return readManifest<IPluginsManifest>(projectPath, PROJECT_FILES.PLUGINS_JSON);
}

export async function writePluginsManifest(
  projectPath: string,
  manifest: IPluginsManifest,
): Promise<void> {
  return writeManifest(projectPath, PROJECT_FILES.PLUGINS_JSON, manifest);
}

export async function readReportsManifest(projectPath: string): Promise<IReportsManifest> {
  return readManifest<IReportsManifest>(projectPath, PROJECT_FILES.REPORTS_JSON);
}

export async function writeReportsManifest(
  projectPath: string,
  manifest: IReportsManifest,
): Promise<void> {
  return writeManifest(projectPath, PROJECT_FILES.REPORTS_JSON, manifest);
}
