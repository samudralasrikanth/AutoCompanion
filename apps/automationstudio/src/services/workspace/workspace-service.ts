import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

/** User-owned workspace, intentionally separate from the extension source tree. */
export function getDefaultAutomationWorkspacePath(): string {
  return path.join(os.homedir(), 'Documents', 'automationstudio');
}

export function ensureAutomationWorkspace(workspacePath = getDefaultAutomationWorkspacePath()): string {
  const folders = [
    'projects',
    'libraries',
    'libraries/playwright',
    'libraries/vision',
    'libraries/python',
    'libraries/python/automationstudio_common',
    'node_modules',
    '.automationstudio',
    '.automationstudio/reports',
    '.automationstudio/cache',
  ];
  fs.mkdirSync(workspacePath, { recursive: true });
  for (const folder of folders) fs.mkdirSync(path.join(workspacePath, folder), { recursive: true });

  writeIfMissing(path.join(workspacePath, 'automationstudio.code-workspace'), JSON.stringify({
    folders: [{ path: '.' }],
    settings: { 'automationStudio.workspaceRoot': workspacePath },
  }, null, 2) + '\n');
  writeIfMissing(path.join(workspacePath, 'package.json'), JSON.stringify({
    name: 'automationstudio-workspace',
    private: true,
    description: 'User workspace for Automation Studio projects and shared web automation libraries',
    scripts: { test: 'playwright test', 'install:playwright': 'npx playwright install' },
    devDependencies: { '@playwright/test': '^1.45.0' },
  }, null, 2) + '\n');
  writeIfMissing(path.join(workspacePath, 'requirements.txt'), '# Shared Python automation dependencies\nplaywright>=1.45\npytest>=8\n');
  writeIfMissing(path.join(workspacePath, 'README.md'), `# Automation Studio Workspace

This is the user-owned workspace for Automation Studio. The extension source code is kept separately from this folder.

## Shared libraries

- **Playwright / TypeScript**: libraries/playwright/index.ts — locator and page helpers for generated or handwritten tests.
- **Surface / Vision**: libraries/vision/index.ts — shared control types and screenshot-analysis contracts.
- **Python**: libraries/python/automationstudio_common/screenshot.py — standard-library screenshot/base64 helpers.

Projects are created in projects/. Each generated project contains only the folders needed for scenarios, shared automation code, test data, configuration, and runtime artifacts. Reports are written to each project under .automationstudio/reports/.
`);
  writeIfMissing(path.join(workspacePath, 'libraries', 'README.md'), `# Shared Automation Studio Libraries

These libraries are intentionally local and readable. Generated code can import them, and users can use the same helpers when writing code manually.

| Library | Entry point | Purpose |
| --- | --- | --- |
| Playwright | playwright/index.ts | Locator, wait, and page helpers |
| Surface / Vision | vision/index.ts | Screen-control types and analysis contracts |
| Python | python/automationstudio_common/screenshot.py | Screenshot bytes and base64 helpers |
`);
  writeIfMissing(path.join(workspacePath, 'libraries', 'playwright', 'package.json'), JSON.stringify({
    name: '@automationstudio/playwright', private: true, main: 'index.ts', types: 'index.ts'
  }, null, 2) + '\n');
  writeIfMissing(path.join(workspacePath, 'libraries', 'playwright', 'index.ts'), `/** Shared helpers available to generated and handwritten Playwright tests. */
export function byRole(page: any, role: string, name?: string): any {
  return name ? page.getByRole(role, { name }) : page.getByRole(role);
}

export function byTestId(page: any, testId: string): any {
  return page.getByTestId(testId);
}

export async function waitForStable(page: any, timeout = 5000): Promise<void> {
  await page.waitForLoadState('domcontentloaded', { timeout });
}
`);
  writeIfMissing(path.join(workspacePath, 'libraries', 'vision', 'README.md'), '# Surface / Vision\n\nUse this library for shared screen-control types, element classification, and screenshot-analysis adapters.\n');
  writeIfMissing(path.join(workspacePath, 'libraries', 'vision', 'index.ts'), `export type SurfaceControlType = 'button' | 'textBox' | 'dropDown' | 'radioButton' | 'checkBox' | 'element';

export interface AnalyzedControl { type: SurfaceControlType; label?: string; bounds?: { x: number; y: number; width: number; height: number }; }

export function isInteractiveControl(control: AnalyzedControl): boolean {
  return control.type !== 'element';
}
`);
  writeIfMissing(path.join(workspacePath, 'libraries', 'python', 'README.md'), '# Python common library\n\nImport `automationstudio_common.screenshot` from handwritten Surface/Python tests.\n');
  writeIfMissing(path.join(workspacePath, 'libraries', 'python', 'automationstudio_common', '__init__.py'), '"""Common Automation Studio Python helpers."""\n');
  writeIfMissing(path.join(workspacePath, 'libraries', 'python', 'automationstudio_common', 'screenshot.py'), `"""Screenshot helpers used by reports and handwritten tests."""
import base64
from pathlib import Path

def file_to_data_uri(file_path: str | Path, mime_type: str = "image/png") -> str:
    data = Path(file_path).read_bytes()
    return f"data:{mime_type};base64,{base64.b64encode(data).decode('ascii')}"
`);
  return workspacePath;
}

function writeIfMissing(filePath: string, content: string): void {
  if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, content, 'utf8');
}
