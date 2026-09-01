/**
 * Project layout constants and directory structure factory.
 * Creates the canonical project folder structure on disk.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PROJECT_FOLDERS, PROJECT_FILES } from '@automation-studio/types';

/** Deliberately small user-facing structure. Runtime internals stay under .automationstudio. */
export const MINIMAL_PROJECT_FOLDERS = [
  PROJECT_FOLDERS.AUTOMATION_SCENARIOS,
  PROJECT_FOLDERS.AUTOMATION_OBJECT_REPOSITORY,
  PROJECT_FOLDERS.AUTOMATION_ACTIONS,
  PROJECT_FOLDERS.AUTOMATION_TESTDATA,
  PROJECT_FOLDERS.AUTOMATION_SELECTORS,
  PROJECT_FOLDERS.AUTOMATION_KEYWORDS,
  PROJECT_FOLDERS.DATA_TESTDATA,
  PROJECT_FOLDERS.ARTIFACTS_SCREENSHOTS,
  PROJECT_FOLDERS.CONFIG,
];

export async function createProjectStructure(projectPath: string): Promise<void> {
  for (const folder of MINIMAL_PROJECT_FOLDERS) {
    await mkdir(join(projectPath, folder), { recursive: true });
  }
  await mkdir(join(projectPath, '.automationstudio', 'reports'), { recursive: true });
  await mkdir(join(projectPath, '.automationstudio', 'cache'), { recursive: true });
  const starterFiles: Record<string, string> = {
    'automation/scenarios/README.md': '# Scenarios\n\nCreate and save Flow Builder scripts in this folder.\n',
    'automation/object-repository/README.md': '# Object Repository\n\nLogical objects used by PW and Surface flows. Object values are safe to commit; secrets are stored in the OS keychain.\n',
    'automation/actions/README.md': '# Reusable Actions\n\nVersioned reusable action definitions used by scenarios.\n',
    'automation/testdata/testdata.json': '{}\n',
    'automation/testdata/README.md': '# Test Data\n\nNon-secret values referenced with data:// URIs. Never store passwords here.\n',
    'automation/testdata/import_template_standard.csv': 'stepName,control,action,value\nFill username,LoginWindow.Username,type,admin@example.com\nEnter password,LoginWindow.Password,type,SecretPass123!\nClick sign in,LoginWindow.LoginButton,click,\nVerify user profile,Dashboard.UserProfile,verify,admin@example.com\n',
    'automation/testdata/import_template_steps.csv': 'stepName,window,control,action,value\nNavigate to application,MainWindow,https://practicetestautomation.com/practice-test-login/,navigate,https://practicetestautomation.com/practice-test-login/\nFill username,LoginWindow,Username,type,student\nFill password,LoginWindow,Password,type,secret://app.password\nSubmit login form,LoginWindow,SubmitButton,click,\nVerify success screen,DashboardWindow,SuccessBanner,verify,\n',
    'automation/testdata/import_template_scenarios.csv': 'scenario,stepName,control,action,value\nScenario 1: Valid Login,Navigate to application,https://practicetestautomation.com/practice-test-login/,navigate,https://practicetestautomation.com/practice-test-login/\nScenario 1: Valid Login,Fill username,LoginWindow.Username,type,student\nScenario 1: Valid Login,Fill password,LoginWindow.Password,type,secret://app.password\nScenario 1: Valid Login,Submit login form,LoginWindow.SubmitButton,click,\nScenario 1: Valid Login,Verify success screen,DashboardWindow.SuccessBanner,verify,\nScenario 2: Invalid Login,Navigate to application,https://practicetestautomation.com/practice-test-login/,navigate,https://practicetestautomation.com/practice-test-login/\nScenario 2: Invalid Login,Fill wrong username,LoginWindow.Username,type,incorrectUser\nScenario 2: Invalid Login,Fill password,LoginWindow.Password,type,secret://app.password\nScenario 2: Invalid Login,Submit login form,LoginWindow.SubmitButton,click,\nScenario 2: Invalid Login,Verify error message,LoginWindow.ErrorMessage,verify,Your username is invalid!\n',
    'automation/testdata/import_template_full.csv': 'scenario,stepName,id,window,control,fullName,type,strategy,locator,value,x,y,width,height\nScenario 1: Login,Fill Username,LoginWindow.Username,LoginWindow,Username,LoginWindow.Username,textBox,ocr,"Username",admin@example.com,120,240,200,32\nScenario 1: Login,Fill Password,LoginWindow.Password,LoginWindow,Password,LoginWindow.Password,textBox,ocr,"Password",SecretPass123!,120,285,200,32\nScenario 1: Login,Click Login,LoginWindow.LoginButton,LoginWindow,LoginButton,LoginWindow.LoginButton,button,ocr,"Login",,120,330,100,36\nScenario 2: Logout,Verify Dashboard,Dashboard.Logout,Dashboard,Logout,Dashboard.Logout,button,ocr,"Logout",,500,20,80,30\n',
    'automation/selectors/README.md': '# Selectors\n\nShared CSS, accessibility, and vision locators for this project.\n',
    'automation/keywords/README.md': '# Keywords\n\nReusable actions shared by scenarios in this project.\n',
    'data/testdata/README.md': '# Test Data\n\nCSV, JSON, and other data files used by scenarios.\n',
    'data/testdata/import_template_standard.csv': 'stepName,control,action,value\nFill username,LoginWindow.Username,type,admin@example.com\nEnter password,LoginWindow.Password,type,SecretPass123!\nClick sign in,LoginWindow.LoginButton,click,\nVerify user profile,Dashboard.UserProfile,verify,admin@example.com\n',
    'data/testdata/import_template_steps.csv': 'stepName,window,control,action,value\nNavigate to application,MainWindow,https://practicetestautomation.com/practice-test-login/,navigate,https://practicetestautomation.com/practice-test-login/\nFill username,LoginWindow,Username,type,student\nFill password,LoginWindow,Password,type,secret://app.password\nSubmit login form,LoginWindow,SubmitButton,click,\nVerify success screen,DashboardWindow,SuccessBanner,verify,\n',
    'data/testdata/import_template_scenarios.csv': 'scenario,stepName,control,action,value\nScenario 1: Valid Login,Navigate to application,https://practicetestautomation.com/practice-test-login/,navigate,https://practicetestautomation.com/practice-test-login/\nScenario 1: Valid Login,Fill username,LoginWindow.Username,type,student\nScenario 1: Valid Login,Fill password,LoginWindow.Password,type,secret://app.password\nScenario 1: Valid Login,Submit login form,LoginWindow.SubmitButton,click,\nScenario 1: Valid Login,Verify success screen,DashboardWindow.SuccessBanner,verify,\nScenario 2: Invalid Login,Navigate to application,https://practicetestautomation.com/practice-test-login/,navigate,https://practicetestautomation.com/practice-test-login/\nScenario 2: Invalid Login,Fill wrong username,LoginWindow.Username,type,incorrectUser\nScenario 2: Invalid Login,Fill password,LoginWindow.Password,type,secret://app.password\nScenario 2: Invalid Login,Submit login form,LoginWindow.SubmitButton,click,\nScenario 2: Invalid Login,Verify error message,LoginWindow.ErrorMessage,verify,Your username is invalid!\n',
    'data/testdata/import_template_full.csv': 'scenario,stepName,id,window,control,fullName,type,strategy,locator,value,x,y,width,height\nScenario 1: Login,Fill Username,LoginWindow.Username,LoginWindow,Username,LoginWindow.Username,textBox,ocr,"Username",admin@example.com,120,240,200,32\nScenario 1: Login,Fill Password,LoginWindow.Password,LoginWindow,Password,LoginWindow.Password,textBox,ocr,"Password",SecretPass123!,120,285,200,32\nScenario 1: Login,Click Login,LoginWindow.LoginButton,LoginWindow,LoginButton,LoginWindow.LoginButton,button,ocr,"Login",,120,330,100,36\nScenario 2: Logout,Verify Dashboard,Dashboard.Logout,Dashboard,Logout,Dashboard.Logout,button,ocr,"Logout",,500,20,80,30\n',
    'artifacts/screenshots/.gitkeep': '',
    'config/README.md': '# Configuration\n\nEnvironment-specific settings for this project.\n',
    'package.json': JSON.stringify({
      name: 'automationstudio-project', private: true,
      scripts: { test: 'playwright test', 'install:browsers': 'npx playwright install' },
      devDependencies: { '@playwright/test': '^1.45.0' },
      dependencies: { '@automationstudio/playwright': 'file:../../libraries/playwright' },
    }, null, 2) + '\n',
    'requirements.txt': '# Optional Python project dependencies\nplaywright>=1.45\npytest>=8\n',
  };
  for (const [relativePath, content] of Object.entries(starterFiles)) {
    const filePath = join(projectPath, relativePath);
    try { await writeFile(filePath, content, { encoding: 'utf-8', flag: 'wx' }); } catch (error: any) {
      if (error?.code !== 'EEXIST') throw error;
    }
  }
}

export async function createProjectGitignore(projectPath: string): Promise<void> {
const content = `# Automation Studio
.automationstudio/
.automationstudio/cache/
.cache/
.history/
.ai/
.settings/
temp/
*.log

# IDE
.vscode/
.idea/

# OS
.DS_Store
Thumbs.db

# Generated
artifacts/
`;
  await writeFile(join(projectPath, PROJECT_FILES.GITIGNORE), content, 'utf-8');
}

export async function createProjectReadme(
  projectPath: string,
  projectName: string,
  description: string,
): Promise<void> {
  const content = `# ${projectName}

${description}

## Automation Studio Project

- **Project Type**: Automation Studio Workspace
- **Created**: ${new Date().toISOString().split('T')[0]}

## Folder Structure

\`\`\`text
automation/
  scenarios/      # Test scenarios and business flows
  object-repository/ # Unified PW and Surface objects
  actions/         # Versioned reusable actions
  testdata/        # Non-secret JSON test data
  selectors/      # Element locators and identifiers
  keywords/       # Reusable actions and keywords

data/
  testdata/       # CSV, JSON, Excel test data

artifacts/        # User-visible runtime artifacts
  screenshots/

.automationstudio/ # Automation Studio internal files
  reports/
  cache/

config/           # JSON configuration files
\`\`\`

## Getting Started

1. Open this project in **Automation Studio**
2. Configure your environment in \`config/environments.json\`
3. Create test scenarios in \`automation/scenarios/\`
4. Run tests using the Automation Studio Execution panel

## Integrations & CI/CD

To run this project in CI/CD, use the Automation Studio CLI:
\`\`\`bash
automation-studio run --project ./ --env default
\`\`\`
`;
  await writeFile(join(projectPath, PROJECT_FILES.README), content, 'utf-8');
}
