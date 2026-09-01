import type { ICommandDescriptor, IServiceProvider, ILogger } from '@automation-studio/types';
import type * as vscode from 'vscode';
import { TYPES } from '../di/types';
import type { ProjectService } from '../services/project/project-service';
import { ensureAutomationWorkspace, getDefaultAutomationWorkspacePath } from '../services/workspace/workspace-service';

export function createProjectCommands(provider: IServiceProvider): ReadonlyArray<ICommandDescriptor> {
  const vscodeModule = require('vscode') as typeof vscode;
  const fs = require('fs') as typeof import('fs');
  const path = require('path') as typeof import('path');
  const os = require('os') as typeof import('os');
  const { BuildPipeline } = require('../engine/build-pipeline');

  return [
    {
      id: 'automationStudio.ai.generateScenario',
      title: 'Generate Scenario with AI',
      category: 'Automation Studio',
      telemetry: true,
      handler: async (): Promise<void> => {
        const logger = provider.resolve<ILogger>(TYPES.Logger);
        try {
          const prompt = await vscodeModule.window.showInputBox({
            prompt: 'Describe the scenario you want to automate...',
            placeHolder: 'e.g., login to the admin portal and check the dashboard',
          });
          
          if (!prompt) return;

          const workspaceRoot = vscodeModule.workspace.workspaceFolders?.[0]?.uri.fsPath;
          if (!workspaceRoot) {
            vscodeModule.window.showErrorMessage('No workspace opened');
            return;
          }

          const { MockAiService } = require('../services/ai/ai-service');
          const aiService = new MockAiService();
          
          vscodeModule.window.withProgress({
            location: vscodeModule.ProgressLocation.Notification,
            title: 'Generating scenario...',
            cancellable: false
          }, async () => {
            const scenario = await aiService.generateScenario(prompt);
            const scenariosDir = path.join(workspaceRoot, 'scenarios');
            await fs.promises.mkdir(scenariosDir, { recursive: true });
            
            const sanitizedName = prompt.replace(/[^a-zA-Z0-9]/g, '-').substring(0, 20).toLowerCase();
            const filePath = path.join(scenariosDir, `${sanitizedName}-${Date.now()}.scenario.json`);
            
            await fs.promises.writeFile(filePath, JSON.stringify(scenario, null, 2), 'utf8');
            
            const doc = await vscodeModule.workspace.openTextDocument(vscodeModule.Uri.file(filePath));
            await vscodeModule.window.showTextDocument(doc);
            
            logger.info('Generated AI scenario', { prompt, filePath });
          });
          
        } catch (error) {
          logger.error('Failed to generate AI scenario', error as Error);
          vscodeModule.window.showErrorMessage('Failed to generate scenario: ' + (error as Error).message);
        }
      }
    },
    {
      id: 'automationStudio.project.create',
      title: 'Create Project',
      category: 'Automation Studio',
      telemetry: true,
      handler: async (): Promise<void> => {
        const logger = provider.resolve<ILogger>(TYPES.Logger);
        const projectService = provider.resolve(TYPES.ProjectService) as ProjectService;

        try {
          const projectName = await vscodeModule.window.showInputBox({
            prompt: 'Enter Project Name',
            placeHolder: 'my-automation-project',
            value: 'my-automation-project',
            validateInput: (value) => {
              if (!value || value.trim().length === 0) {
                return 'Project name cannot be empty';
              }
              if (/[<>:"/\\|?*]/.test(value)) {
                return 'Project name contains invalid characters';
              }
              return null;
            }
          });
          if (!projectName) return;

          const automationWorkspace = ensureAutomationWorkspace(getDefaultAutomationWorkspacePath());
          const defaultParentPath = path.join(automationWorkspace, 'projects');

          const defaultLocation = defaultParentPath;
          const projectPath = path.join(defaultLocation, projectName);

          let manifest;
          if (fs.existsSync(path.join(projectPath, 'project.json'))) {
            manifest = await projectService.manager.open(projectPath);
          } else {
            interface ProjectTypeItem {
              label: string;
              description: string;
              templateId: string;
              technologyId: string;
            }

            const projectType = await vscodeModule.window.showQuickPick<ProjectTypeItem>(
              [
                {
                  label: '$(browser) Web Automation (Playwright)',
                  description: 'Playwright browser testing for modern web apps',
                  templateId: 'playwright',
                  technologyId: 'playwright',
                },
                {
                  label: '$(device-desktop) Desktop Automation (Surface)',
                  description: 'Native desktop application testing with OCR vision',
                  templateId: 'enterprise',
                  technologyId: 'desktop',
                },
                {
                  label: '$(layers) Hybrid (Web + Desktop)',
                  description: 'Unified cross-platform testing across Web and Desktop',
                  templateId: 'enterprise',
                  technologyId: 'hybrid',
                },
                {
                  label: '$(organization) Enterprise Full-Suite',
                  description: 'Complete architecture with CI/CD, environments, and custom reports',
                  templateId: 'enterprise',
                  technologyId: 'hybrid',
                },
              ],
              { placeHolder: 'Select Project Architecture & Technology' }
            );
            if (!projectType) return;

            manifest = await projectService.manager.create({
              name: projectName,
              location: defaultLocation,
              template: projectType.templateId as any,
              technology: projectType.technologyId as any,
            });
            await projectService.manager.open(projectPath);
          }

          // Keep a concrete workspace file next to the generated project so it can
          // be reopened as a complete Automation Studio workspace later.
          const workspaceFile = path.join(projectPath, `${projectName}.code-workspace`);
          if (!fs.existsSync(workspaceFile)) {
            await fs.promises.writeFile(workspaceFile, JSON.stringify({ folders: [{ path: '.' }], settings: {} }, null, 2), 'utf8');
          }

          const projectUri = vscodeModule.Uri.file(projectPath);
          const isAlreadyInWorkspace = vscodeModule.workspace.workspaceFolders?.some(folder => {
            const folderPath = folder.uri.fsPath;
            return projectPath === folderPath || projectPath.startsWith(folderPath + path.sep);
          });

          if (isAlreadyInWorkspace) {
            vscodeModule.window.showInformationMessage(`Project "${manifest.projectName}" loaded successfully.`);
          } else {
            const success = vscodeModule.workspace.updateWorkspaceFolders(
              vscodeModule.workspace.workspaceFolders ? vscodeModule.workspace.workspaceFolders.length : 0,
              null,
              { uri: projectUri, name: manifest.projectName }
            );

            if (!success) {
              await vscodeModule.commands.executeCommand('vscode.openFolder', projectUri, { forceNewWindow: false });
            } else {
              vscodeModule.window.showInformationMessage(`Project "${manifest.projectName}" loaded successfully.`);
            }
          }
        } catch (error) {
          logger.error('Failed to create project', error as Error);
          vscodeModule.window.showErrorMessage(`Failed to create project: ${error instanceof Error ? error.message : String(error)}`);
        }
      },
    },
    {
      id: 'automationStudio.project.open',
      title: 'Open Project',
      category: 'Automation Studio',
      telemetry: true,
      handler: async (targetPath?: unknown, ...args: any[]): Promise<void> => {
        const logger = provider.resolve<ILogger>(TYPES.Logger);
        const projectService = provider.resolve(TYPES.ProjectService) as ProjectService;

        try {
          let projectRoot = targetPath as string | undefined;
          if (!projectRoot) {
            const defaultParentPath = path.join(ensureAutomationWorkspace(getDefaultAutomationWorkspacePath()), 'projects');

            const folderUri = await vscodeModule.window.showOpenDialog({
              canSelectFiles: false,
              canSelectFolders: true,
              canSelectMany: false,
              defaultUri: vscodeModule.Uri.file(defaultParentPath),
              openLabel: 'Open Project Folder'
            });
            if (!folderUri || folderUri.length === 0 || !folderUri[0]) return;
            projectRoot = folderUri[0].fsPath;
          }

          if (!fs.existsSync(path.join(projectRoot, 'project.json'))) {
            vscodeModule.window.showErrorMessage(`Selected folder is not a valid Automation Studio project (missing project.json).`);
            return;
          }

          const manifest = await projectService.manager.open(projectRoot);

          const projectUri = vscodeModule.Uri.file(projectRoot);
          const isAlreadyInWorkspace = vscodeModule.workspace.workspaceFolders?.some(folder => {
            const folderPath = folder.uri.fsPath;
            return projectRoot === folderPath || projectRoot!.startsWith(folderPath + path.sep);
          });

          if (!isAlreadyInWorkspace) {
            vscodeModule.workspace.updateWorkspaceFolders(
              vscodeModule.workspace.workspaceFolders ? vscodeModule.workspace.workspaceFolders.length : 0,
              null,
              { uri: projectUri, name: manifest.projectName }
            );
          }

          vscodeModule.window.showInformationMessage(`Project "${manifest.projectName}" opened successfully.`);
        } catch (error) {
          logger.error('Failed to open project', error as Error);
          vscodeModule.window.showErrorMessage(`Failed to open project: ${error instanceof Error ? error.message : String(error)}`);
        }
      },
    },
    {
      id: 'automationStudio.project.close',
      title: 'Close Project',
      category: 'Automation Studio',
      telemetry: true,
      handler: async (): Promise<void> => {
        const logger = provider.resolve<ILogger>(TYPES.Logger);
        const projectService = provider.resolve(TYPES.ProjectService) as ProjectService;

        try {
          const currentProject = projectService.manager.getCurrentProject();
          if (!currentProject) {
            vscodeModule.window.showInformationMessage('No project is currently open.');
            return;
          }

          await projectService.manager.close();
          vscodeModule.window.showInformationMessage(`Project closed.`);
        } catch (error) {
          logger.error('Failed to close project', error as Error);
          vscodeModule.window.showErrorMessage(`Failed to close project: ${error instanceof Error ? error.message : String(error)}`);
        }
      },
    },
    {
      id: 'automationStudio.project.reload',
      title: 'Reload Project',
      category: 'Automation Studio',
      telemetry: true,
      handler: async (): Promise<void> => {
        const projectService = provider.resolve(TYPES.ProjectService) as ProjectService;
        const projectPath = projectService.manager.getCurrentProjectPath();
        if (projectPath) await projectService.manager.open(projectPath);
      }
    },
    {
      id: 'automationStudio.project.openRecent',
      title: 'Open Recent Project',
      category: 'Automation Studio',
      telemetry: true,
      handler: async (): Promise<void> => {
        const projectService = provider.resolve(TYPES.ProjectService) as ProjectService;
        const recents = await projectService.recentProjects.getRecentProjects();
        if (recents.length === 0) {
          vscodeModule.window.showInformationMessage('No recent projects found.');
          return;
        }
        
        const items = recents.map(p => ({
          label: p.projectName,
          description: p.projectPath,
          projectPath: p.projectPath
        }));
        
        const selected = await vscodeModule.window.showQuickPick(items, { placeHolder: 'Select a recent project' });
        if (selected) {
          const manifest = await projectService.manager.open(selected.projectPath);
          const projectUri = vscodeModule.Uri.file(selected.projectPath);
          vscodeModule.workspace.updateWorkspaceFolders(
            vscodeModule.workspace.workspaceFolders ? vscodeModule.workspace.workspaceFolders.length : 0,
            null,
            { uri: projectUri, name: manifest.projectName }
          );
        }
      }
    },
    {
      id: 'automationStudio.scenario.create',
      title: 'Create Scenario',
      category: 'Automation Studio',
      telemetry: true,
      handler: async (): Promise<void> => {
        const projectService = provider.resolve(TYPES.ProjectService) as ProjectService;
        const projectPath = projectService.manager.getCurrentProjectPath();
        if (!projectPath) {
          vscodeModule.window.showErrorMessage('Open or create an Automation Studio project first.');
          return;
        }
        const name = await vscodeModule.window.showInputBox({ prompt: 'Scenario name', value: 'new-scenario' });
        if (!name) return;
        const scenariosDir = path.join(projectPath, 'automation', 'scenarios');
        await fs.promises.mkdir(scenariosDir, { recursive: true });
        const fileName = `${name.trim().replace(/[^a-zA-Z0-9_-]+/g, '-').toLowerCase()}.scenario.json`;
        const filePath = path.join(scenariosDir, fileName);
        const scenario = {
          id: `${Date.now()}-${fileName}`,
          name: name.trim(),
          mode: 'playwright',
          metadata: { schemaVersion: '1.0', createdBy: 'Automation Studio' },
          steps: [],
        };
        await fs.promises.writeFile(filePath, JSON.stringify(scenario, null, 2) + '\n', { encoding: 'utf8', flag: 'wx' }).catch(async (error: any) => {
          if (error?.code === 'EEXIST') throw new Error(`Scenario already exists: ${fileName}`);
          throw error;
        });
        const document = await vscodeModule.workspace.openTextDocument(vscodeModule.Uri.file(filePath));
        await vscodeModule.window.showTextDocument(document);
        await vscodeModule.commands.executeCommand('automationStudio.project.reload');
        vscodeModule.window.showInformationMessage(`Created scenario ${fileName}`);
      }
    },
    {
      id: 'automationStudio.openResource',
      title: 'Open',
      category: 'Automation Studio',
      telemetry: false,
      handler: async (node?: any): Promise<void> => {
        const uri = node?.resourceUri;
        if (uri) await vscodeModule.commands.executeCommand('vscode.open', uri);
      }
    },
    {
      id: 'automationStudio.revealResource',
      title: 'Reveal in Finder',
      category: 'Automation Studio',
      telemetry: false,
      handler: async (node?: any): Promise<void> => {
        const uri = node?.resourceUri;
        if (uri) await vscodeModule.commands.executeCommand('revealFileInOS', uri);
      }
    },
    {
      id: 'automationStudio.renameResource',
      title: 'Rename',
      category: 'Automation Studio',
      telemetry: false,
      handler: async (node?: any): Promise<void> => {
        const uri = node?.resourceUri;
        if (!uri) return;
        const nextName = await vscodeModule.window.showInputBox({ prompt: 'New name', value: path.basename(uri.fsPath) });
        if (!nextName || nextName === path.basename(uri.fsPath)) return;
        await fs.promises.rename(uri.fsPath, path.join(path.dirname(uri.fsPath), nextName.trim()));
        await vscodeModule.commands.executeCommand('automationStudio.project.reload');
      }
    },
    {
      id: 'automationStudio.deleteResource',
      title: 'Delete',
      category: 'Automation Studio',
      telemetry: false,
      handler: async (node?: any): Promise<void> => {
        const uri = node?.resourceUri;
        if (!uri) return;
        const confirm = await vscodeModule.window.showWarningMessage(`Delete ${path.basename(uri.fsPath)}?`, { modal: true }, 'Delete');
        if (confirm !== 'Delete') return;
        await fs.promises.rm(uri.fsPath, { recursive: true, force: true });
        await vscodeModule.commands.executeCommand('automationStudio.project.reload');
      }
    },
    {
      id: 'automationStudio.objectRepository.create',
      title: 'Create Object Repository',
      category: 'Automation Studio',
      telemetry: true,
      handler: async (): Promise<void> => {
        const projectPath = (provider.resolve(TYPES.ProjectService) as ProjectService).manager.getCurrentProjectPath();
        if (!projectPath) {
          vscodeModule.window.showWarningMessage('Open an Automation Studio project before creating its object repository.');
          return;
        }
        const repositoryPath = path.join(projectPath, 'automation', 'object-repository');
        await fs.promises.mkdir(repositoryPath, { recursive: true });
        const readmePath = path.join(repositoryPath, 'README.md');
        if (!fs.existsSync(readmePath)) {
          await fs.promises.writeFile(readmePath, '# Unified Object Repository\n\nObjects use object:// URIs and can contain PW and Surface locators.\n', 'utf8');
        }
        await vscodeModule.commands.executeCommand('automationStudio.project.reload');
        vscodeModule.window.showInformationMessage(`Object Repository ready: ${repositoryPath}`);
      }
    },
    {
      id: 'automationStudio.project.build',
      title: 'Build Scenario',
      category: 'Automation Studio',
      telemetry: true,
      handler: async (scenarioUri?: unknown, ...args: any[]): Promise<void> => {
        const logger = provider.resolve<ILogger>(TYPES.Logger);
        try {
          const uri = scenarioUri as vscode.Uri | undefined;
          if (!uri) {
            vscodeModule.window.showErrorMessage('No scenario specified for build.');
            return;
          }
          const scenarioContent = fs.readFileSync(uri.fsPath, 'utf8');
          const scenario = JSON.parse(scenarioContent);
          
          // --- Mode-aware profile selection ---
          // Priority: scenario.mode > scenario.metadata.generatedBy > user pick
          let detectedMode: string | undefined = scenario.mode;
          if (!detectedMode && scenario.metadata?.generatedBy) {
            const gen = scenario.metadata.generatedBy.toLowerCase();
            if (gen.includes('vision') || gen.includes('surface')) {
              detectedMode = 'surface';
            } else if (gen.includes('playwright') || gen.includes('web')) {
              detectedMode = 'playwright';
            }
          }

          let profile: { id: string; name: string; language: string; framework: string; outDir: string };

          if (detectedMode === 'surface') {
            profile = { id: 'python-surface', name: 'Python Surface', language: 'python', framework: 'surface', outDir: 'generated/surface' };
          } else if (detectedMode === 'playwright') {
            profile = { id: 'typescript-playwright', name: 'TypeScript Playwright', language: 'typescript', framework: 'playwright', outDir: 'generated/typescript' };
          } else {
            // No mode detected — ask the user
            const modeChoice = await vscodeModule.window.showQuickPick(
              [
                { label: 'Playwright (TypeScript)', description: 'Web automation with Playwright', value: 'playwright-ts' },
                { label: 'Playwright (Python)', description: 'Web automation with Playwright', value: 'playwright-py' },
                { label: 'Surface', description: 'Desktop/Vision automation with SDK pipeline', value: 'surface' },
              ],
              { placeHolder: 'Select build mode for this scenario' }
            );
            if (!modeChoice) return;

            switch (modeChoice.value) {
              case 'surface':
                profile = { id: 'python-surface', name: 'Python Surface', language: 'python', framework: 'surface', outDir: 'generated/surface' };
                break;
              case 'playwright-py':
                profile = { id: 'python-playwright', name: 'Python Playwright', language: 'python', framework: 'playwright', outDir: 'generated/python' };
                break;
              case 'playwright-ts':
              default:
                profile = { id: 'typescript-playwright', name: 'TypeScript Playwright', language: 'typescript', framework: 'playwright', outDir: 'generated/typescript' };
                break;
            }
          }
          
          const workspaceRoot = vscodeModule.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
          
          let objectsMap = undefined;
          try {
            const { FileSystemRepository } = require('@automation-studio/sdk/src/repository/file-system-repository');
            const repo = new FileSystemRepository(workspaceRoot);
            const allObjects = await repo.getAllObjects();
            objectsMap = allObjects.reduce((acc: any, obj: any) => {
              acc[obj.id] = obj;
              return acc;
            }, {});
          } catch (e) {
            logger.warn('Failed to load object repository', { error: e });
          }

          const pipeline = new BuildPipeline();
          const result = pipeline.build(scenario, profile, { workspaceRoot, forceBuild: false, objects: objectsMap });
          
          if (result.skipped) {
            vscodeModule.window.showInformationMessage('Build skipped (no changes detected).');
            return;
          }
          
          if (!result.success) {
            logger.error('Build failed', { warnings: result.warnings } as any);
            vscodeModule.window.showErrorMessage(`Build failed with ${result.warnings.length} errors/warnings.`);
            return;
          }
          
          if (result.warnings.length > 0) {
            logger.warn('Build completed with warnings', { warnings: result.warnings });
            vscodeModule.window.showWarningMessage(`Build completed with ${result.warnings.length} warnings.`);
          }
          
          if (result.generatedCode) {
            const workspaceFolder = vscodeModule.workspace.workspaceFolders?.[0]?.uri.fsPath;
            if (workspaceFolder) {
              const outDir = path.join(workspaceFolder, profile.outDir);
              fs.mkdirSync(outDir, { recursive: true });
              const ext = profile.language === 'typescript' ? '.ts' : '.py';
              const outFile = path.join(outDir, `${scenario.name.replace(/[^a-zA-Z0-9]/g, '_')}${ext}`);
              fs.writeFileSync(outFile, result.generatedCode);

              // Validate Python syntax for Python output
              if (profile.language === 'python') {
                const pythonPath = vscodeModule.workspace.getConfiguration('automationStudio').get<string>('pythonPath') || 'python';
                const { exec } = require('child_process') as typeof import('child_process');
                const escapedFile = outFile.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
                const cmd = `"${pythonPath}" -c "import ast; ast.parse(open('${escapedFile}', encoding='utf-8').read())"`;
                
                exec(cmd, (err: any) => {
                  if (err) {
                    logger.warn(`Python syntax validation failed for ${outFile}`, err);
                    vscodeModule.window.showWarningMessage(`Python script generated, but syntax validation failed. Check your Python syntax/interpreter.`);
                  } else {
                    vscodeModule.window.showInformationMessage(`Successfully generated and validated ${outFile}`);
                  }
                });
              } else {
                vscodeModule.window.showInformationMessage(`Successfully generated ${outFile}`);
              }
            }
          }
        } catch (error) {
          logger.error('Build failed', error as Error);
          vscodeModule.window.showErrorMessage(`Build failed: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    },
    {
      id: 'automationStudio.deleteProject',
      title: 'Delete Project',
      category: 'Automation Studio',
      telemetry: true,
      handler: async (node?: any): Promise<void> => {
        const logger = provider.resolve<ILogger>(TYPES.Logger);
        const projectService = provider.resolve(TYPES.ProjectService) as ProjectService;

        try {
          let projectPath: string | undefined;

          if (node && node.resourceUri) {
            projectPath = node.resourceUri.fsPath;
          } else {
            // Fallback: use the currently open project
            projectPath = projectService.manager.getCurrentProjectPath();
          }

          if (!projectPath) {
            vscodeModule.window.showErrorMessage('No project selected to delete.');
            return;
          }

          const projectName = path.basename(projectPath);
          const confirm = await vscodeModule.window.showWarningMessage(
            `Are you sure you want to permanently delete project "${projectName}"?\n\nThis will recursively remove:\n${projectPath}\n\nThis action cannot be undone.`,
            { modal: true },
            'Delete'
          );

          if (confirm !== 'Delete') return;

          // Close the project first if it's the currently open one
          const currentPath = projectService.manager.getCurrentProjectPath();
          if (currentPath === projectPath) {
            await projectService.manager.close();
          }

          // Remove the workspace folder if it matches
          const workspaceFolders = vscodeModule.workspace.workspaceFolders;
          if (workspaceFolders) {
            const folderIndex = workspaceFolders.findIndex(
              (f) => f.uri.fsPath === projectPath
            );
            if (folderIndex !== -1) {
              vscodeModule.workspace.updateWorkspaceFolders(folderIndex, 1);
            }
          }

          // Perform the actual delete
          await projectService.manager.delete(projectPath);

          vscodeModule.window.showInformationMessage(`Project "${projectName}" deleted.`);
        } catch (error) {
          logger.error('Failed to delete project', error as Error);
          vscodeModule.window.showErrorMessage(
            `Failed to delete project: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }
    }
  ];
}
