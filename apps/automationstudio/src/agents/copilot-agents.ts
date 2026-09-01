import * as vscode from 'vscode';
import * as path from 'node:path';
import { promises as fs } from 'node:fs';
import { AutomationStudioAgentService, type AgentMode, type AnalyzeObjectOptions, type BuildObjectRepositoryOptions, type GherkinOptions } from './automation-studio-agent-service';
import {
  AIAgentService,
  type RequirementsToTestsOptions,
  type RequirementsToTestsResult,
  type TestDesignOptions,
  type TestDesignResult,
  type RCAOptions,
  type RCAResult,
  type SelfHealOptions,
  type SelfHealResult,
  type ReleaseReadinessOptions,
  type ReleaseReadinessResult,
  type OrchestrationOptions,
  type OrchestrationResult,
} from './ai-agent-service';

interface ProjectPathProvider {
  getCurrentProjectPath(): string | undefined;
}

interface BuildRepositoryInput {
  projectPath?: string;
  scenarioPath?: string;
  mode?: AgentMode;
  write?: boolean;
}

interface AnalyzeObjectInput {
  projectPath?: string;
  objectId: string;
  write?: boolean;
  correction?: AnalyzeObjectOptions['correction'];
}

interface GherkinInput {
  projectPath?: string;
  text?: string;
  filePath?: string;
  scenarioName?: string;
  write?: boolean;
}

interface RequirementsInput {
  projectPath?: string;
  text?: string;
  filePath?: string;
  mode?: AgentMode;
  scenarioName?: string;
  write?: boolean;
}

interface TestDesignInput {
  projectPath?: string;
  scope?: string;
  coverageGoal?: 'smoke' | 'regression' | 'full';
  includeEdgeCases?: boolean;
}

interface RCAInput {
  projectPath?: string;
  executionId?: string;
  reportPath?: string;
}

interface SelfHealInput {
  projectPath?: string;
  scenarioPath?: string;
  failedStepId?: string;
  dryRun?: boolean;
  write?: boolean;
}

interface ReleaseReadinessInput {
  projectPath?: string;
  passThreshold?: number;
  maxFlakyPercent?: number;
}

interface OrchestrationInput {
  projectPath?: string;
  pipeline?: ('requirements' | 'design' | 'heal' | 'rca' | 'readiness')[];
  write?: boolean;
}

const toolResult = (value: unknown): vscode.LanguageModelToolResult =>
  new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(JSON.stringify(value, null, 2))]);

export class AutomationStudioCopilotAgents {
  private readonly service = new AutomationStudioAgentService();
  private readonly aiService = new AIAgentService();
  private readonly telemetryLogger = vscode.env.createTelemetryLogger({
    sendEventData(eventName: string, data?: Record<string, any>) {
      console.log(`[Telemetry] ${eventName}`, data);
    },
    sendErrorData(error: Error, data?: Record<string, any>) {
      console.error(`[Telemetry Error]`, error, data);
    }
  });

  constructor(private readonly projectService: ProjectPathProvider) {}

  public register(context: vscode.ExtensionContext): void {
    if (!vscode.chat?.createChatParticipant) return;

    if (vscode.lm?.registerTool) {
      const getProject = () => this.projectService.getCurrentProjectPath();
      context.subscriptions.push(
        vscode.lm.registerTool('automationStudio_build_object_repository', new BuildObjectRepositoryTool(this.service, getProject)),
        vscode.lm.registerTool('automationStudio_analyze_object', new AnalyzeObjectTool(this.service, getProject)),
        vscode.lm.registerTool('automationStudio_generate_gherkin_hierarchy', new GenerateGherkinTool(this.service, getProject)),
        vscode.lm.registerTool('automationStudio_requirements_to_tests', new RequirementsToTestsTool(this.aiService, getProject)),
        vscode.lm.registerTool('automationStudio_test_design', new TestDesignTool(this.aiService, getProject)),
        vscode.lm.registerTool('automationStudio_rca', new RCATool(this.aiService, getProject)),
        vscode.lm.registerTool('automationStudio_self_heal', new SelfHealTool(this.aiService, getProject)),
        vscode.lm.registerTool('automationStudio_release_readiness', new ReleaseReadinessTool(this.aiService, getProject)),
        vscode.lm.registerTool('automationStudio_orchestrate', new OrchestrateTool(this.aiService, getProject)),
      );
    }

    for (const participantId of ['automationstudio', 'automatiostudio']) {
      const participant = vscode.chat.createChatParticipant(participantId, async (request, context, response, token) => {
        this.telemetryLogger.logUsage('automationStudio.agent.invoked', { agentName: request.command || 'default' });
        await this.handleChatRequest(request, context, response, token);
      });
      participant.iconPath = vscode.Uri.joinPath(context.extensionUri, 'assets', 'record-button.png');
      participant.followupProvider = {
        provideFollowups: () => [
          { prompt: 'Build a preview of the unified Object Repository from the current project', label: 'Build Object Repository' },
          { prompt: 'Generate a Gherkin hierarchy from this test case and preview the feature file', label: 'Generate Gherkin' },
          { prompt: 'Analyze object://app.login.username and suggest locator corrections', label: 'Analyze an object' },
          { prompt: 'Generate tests from requirements: User can login with valid credentials', label: 'Requirements → Tests' },
          { prompt: 'Design a test strategy for the current project', label: 'Test Design' },
          { prompt: 'Analyze the root cause of the last failure', label: 'Root Cause Analysis' },
          { prompt: 'Heal broken locators from recent failures', label: 'Self-Heal Locators' },
          { prompt: 'Is this release ready? Assess pass rates and flaky tests', label: 'Release Readiness' },
          { prompt: 'Run the full agent pipeline: heal → rca → readiness', label: 'Run Agent Pipeline' },
        ],
      };
      context.subscriptions.push(participant);
    }
  }

  private async handleChatRequest(request: vscode.ChatRequest, context: vscode.ChatContext, response: vscode.ChatResponseStream, token: vscode.CancellationToken): Promise<void> {
    const prompt = request.prompt.trim();
    const lower = prompt.toLowerCase();
    const projectPath = this.projectService.getCurrentProjectPath();

    try {
      if (/(object repository|object-repository|unified object|build.*objects|objects.*scenario)/i.test(prompt)) {
        const activeProject = this.requireProject(projectPath);
        const write = /\b(save|write|update|persist|apply)\b/i.test(prompt);
        response.progress(write ? 'Building and saving the unified Object Repository…' : 'Scanning scenarios and preparing an Object Repository preview…');
        const result = await this.invokeTool('automationStudio_build_object_repository', {
          projectPath: activeProject,
          mode: lower.includes('surface') && !lower.includes('pw') ? 'surface' : lower.includes('pw') && !lower.includes('surface') ? 'pw' : 'all',
          write,
        }, request, token);
        response.markdown(this.objectRepositoryMarkdown(result, write));
        return;
      }

      if (/(analy[sz]e|correct|heal).*(object|locator)|object.*(analy[sz]e|correct|heal)/i.test(prompt)) {
        const activeProject = this.requireProject(projectPath);
        const objectId = prompt.match(/object:\/\/([A-Za-z0-9._-]+)/)?.[1] || prompt.match(/\bapp\.[A-Za-z0-9._-]+/)?.[0];
        if (!objectId) {
          response.markdown('Tell me which object to analyze, for example `Analyze object://app.login.username`.');
          return;
        }
        const result = await this.invokeTool('automationStudio_analyze_object', {
          projectPath: activeProject,
          objectId,
          write: /\b(save|write|update|apply)\b/i.test(prompt),
        }, request, token);
        response.markdown(this.analyzeMarkdown(result));
        return;
      }

      if (/(gherkin|feature file|test case|acceptance criteria|given.*when.*then)/i.test(prompt)) {
        const activeProject = this.requireProject(projectPath);
        const reference = await this.fileReference(request, activeProject);
        const input: GherkinInput = {
          projectPath: activeProject,
          text: reference ? undefined : prompt.replace(/^(generate|build|create)\s+(a\s+)?(gherkin|feature file)\s*(from|for)?\s*/i, '').trim(),
          filePath: reference,
          scenarioName: this.extractScenarioName(prompt),
          write: /\b(save|write|update|persist|create file)\b/i.test(prompt),
        };
        response.progress(input.write ? 'Generating and saving the Gherkin hierarchy…' : 'Generating a Gherkin hierarchy preview…');
        const result = await this.invokeTool('automationStudio_generate_gherkin_hierarchy', input, request, token);
        response.markdown(this.gherkinMarkdown(result));
        return;
      }

      // ── AI Agent routes ──────────────────────────────────────────────

      if (/(requirement|req|user story|acceptance criteria).*test|test.*from.*(requirement|story|spec)|generate.*test.*from/i.test(prompt)) {
        const activeProject = this.requireProject(projectPath);
        const write = /\b(save|write|create|persist)\b/i.test(prompt);
        response.progress(write ? 'Generating and saving tests from requirements…' : 'Generating tests from requirements (preview)…');
        const requirementText = prompt.replace(/^.*?(requirement|req|user story|acceptance criteria|spec)s?\s*:?\s*/i, '').trim();
        const result = await this.invokeTool('automationStudio_requirements_to_tests', {
          projectPath: activeProject,
          text: requirementText || undefined,
          mode: lower.includes('surface') ? 'surface' : 'pw',
          write,
        } as RequirementsInput, request, token);
        response.markdown(this.requirementsToTestsMarkdown(result));
        return;
      }

      if (/(test design|test strategy|test plan|coverage matrix|what.*should.*test|suggest.*test|design.*test)/i.test(prompt)) {
        const activeProject = this.requireProject(projectPath);
        const goal = lower.includes('smoke') ? 'smoke' as const : lower.includes('full') ? 'full' as const : 'regression' as const;
        response.progress('Designing test strategy…');
        const result = await this.invokeTool('automationStudio_test_design', {
          projectPath: activeProject,
          coverageGoal: goal,
          includeEdgeCases: lower.includes('edge') || goal === 'full',
        } as TestDesignInput, request, token);
        response.markdown(this.testDesignMarkdown(result));
        return;
      }

      if (/(rca|root cause|why.*fail|failure analysis|diagnos|what went wrong)/i.test(prompt)) {
        const activeProject = this.requireProject(projectPath);
        const executionId = prompt.match(/(?:execution|run|report)\s+([a-f0-9-]{8,})/i)?.[1];
        response.progress('Analyzing failure root cause…');
        const result = await this.invokeTool('automationStudio_rca', {
          projectPath: activeProject,
          executionId,
        } as RCAInput, request, token);
        response.markdown(this.rcaMarkdown(result));
        return;
      }

      if (/(self.?heal|fix.*locator|heal.*locator|auto.?repair|repair.*selector|heal.*broken)/i.test(prompt)) {
        const activeProject = this.requireProject(projectPath);
        const write = /\b(save|write|apply|fix|update|repair)\b/i.test(prompt) && !/\b(preview|dry|show)\b/i.test(prompt);
        response.progress(write ? 'Self-healing locators and saving updates…' : 'Analyzing broken locators (dry run)…');
        const result = await this.invokeTool('automationStudio_self_heal', {
          projectPath: activeProject,
          dryRun: !write,
        } as SelfHealInput, request, token);
        response.markdown(this.selfHealMarkdown(result));
        return;
      }

      if (/(release.*read|ready.*release|go.?no.?go|release.*assess|can.*release|ship.*ready)/i.test(prompt)) {
        const activeProject = this.requireProject(projectPath);
        response.progress('Assessing release readiness…');
        const result = await this.invokeTool('automationStudio_release_readiness', {
          projectPath: activeProject,
        } as ReleaseReadinessInput, request, token);
        response.markdown(this.releaseReadinessMarkdown(result));
        return;
      }

      if (/(orchestrat|run.*pipeline|multi.?agent|agent.*pipeline|full.*analysis|run.*all.*agent)/i.test(prompt)) {
        const activeProject = this.requireProject(projectPath);
        const write = /\b(save|write|apply|fix)\b/i.test(prompt);
        response.progress('Running multi-agent orchestration pipeline…');
        const result = await this.invokeTool('automationStudio_orchestrate', {
          projectPath: activeProject,
          write,
        } as OrchestrationInput, request, token);
        response.markdown(this.orchestrationMarkdown(result));
        return;
      }

      await this.answerWithModel(request, context, response, token, projectPath);
    } catch (error) {
      response.markdown(`**Automation Studio agent error**\n\n${this.escapeMarkdown(error instanceof Error ? error.message : String(error))}`);
    }
  }

  private async fileReference(request: vscode.ChatRequest, projectPath: string): Promise<string | undefined> {
    for (const reference of request.references) {
      const value = reference.value;
      const uri = value instanceof vscode.Uri ? value : value instanceof vscode.Location ? value.uri : undefined;
      if (!uri || uri.scheme !== 'file') continue;
      const resolved = path.resolve(uri.fsPath);
      if (resolved !== projectPath && !resolved.startsWith(`${projectPath}${path.sep}`)) continue;
      try {
        await fs.access(resolved);
        return path.relative(projectPath, resolved);
      } catch { /* Ignore unresolved references. */ }
    }
    return undefined;
  }

  private requireProject(projectPath: string | undefined): string {
    if (!projectPath) throw new Error('Open or create an Automation Studio project first for this operation.');
    return projectPath;
  }

  private async answerWithModel(
    request: vscode.ChatRequest,
    context: vscode.ChatContext,
    response: vscode.ChatResponseStream,
    token: vscode.CancellationToken,
    projectPath?: string,
  ): Promise<void> {
    const model = request.model;
    if (!model) {
      response.markdown(this.capabilityFallback(projectPath));
      return;
    }

    const projectContext = await this.projectContext(projectPath);
    const referenceContext = await this.referenceContext(request, projectPath);
    const systemPrompt = [
      'You are the Automation Studio assistant inside VS Code.',
      'Answer the user directly and helpfully for any question about software testing, automation design, Playwright, Surface/Desktop automation, OCR, projects, scenarios, Gherkin, debugging, reports, or how to use this extension.',
      'Explain processes step by step when the user asks how to do something. The extension has built-in AI agents: Requirements-to-Tests, Test Design, Root Cause Analysis (RCA), Self-Healing locators, Release Readiness assessment, and Multi-Agent Orchestration. These are fully implemented. Mainframe, Jira/Xray, API, database, and Citrix are roadmap items, not implemented integrations.',
      'When the user asks about the current project, use the project context below. Do not invent files, commands, integrations, or execution results.',
      projectContext,
      referenceContext,
    ].join('\n\n');

    const messages = [vscode.LanguageModelChatMessage.User(systemPrompt)];
    for (const turn of context.history) {
      if (turn instanceof vscode.ChatRequestTurn) {
        messages.push(vscode.LanguageModelChatMessage.User(turn.prompt));
      } else if (turn instanceof vscode.ChatResponseTurn) {
        const responseText = turn.response.map(part => {
          if (part instanceof vscode.ChatResponseMarkdownPart) {
            return part.value.value;
          }
          return '';
        }).join('\n');
        messages.push(vscode.LanguageModelChatMessage.Assistant(responseText));
      }
    }
    messages.push(vscode.LanguageModelChatMessage.User(request.prompt));

    response.progress(`Answering with ${model.name || 'the selected Copilot model'}…`);
    try {
      const modelResponse = await model.sendRequest(
        messages,
        {
          justification: 'Answer the user using the Automation Studio assistant and current project context.',
        },
        token,
      );
      let emitted = false;
      for await (const part of modelResponse.stream) {
        if (part instanceof vscode.LanguageModelTextPart) {
          response.markdown(part.value);
          emitted = true;
        }
      }
      if (!emitted) response.markdown(this.capabilityFallback(projectPath));
    } catch (error) {
      response.markdown(`I could not reach the selected Copilot model. ${this.escapeMarkdown(error instanceof Error ? error.message : String(error))}\n\n${this.capabilityFallback(projectPath)}`);
    }
  }

  private async projectContext(projectPath?: string): Promise<string> {
    if (!projectPath) return 'Project context: no Automation Studio project is currently open.';
    const files: string[] = [];
    const visit = async (directory: string): Promise<void> => {
      if (files.length >= 80) return;
      let entries: import('node:fs').Dirent[] = [];
      try { entries = await fs.readdir(directory, { withFileTypes: true }) as unknown as import('node:fs').Dirent[]; } catch { return; }
      for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
        if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === '.automationstudio/cache') continue;
        const fullPath = path.join(directory, entry.name);
        const relative = path.relative(projectPath, fullPath) || entry.name;
        if (entry.isDirectory()) await visit(fullPath);
        else files.push(relative);
        if (files.length >= 80) return;
      }
    };
    await visit(projectPath);
    return `Project context: ${projectPath}\nProject files (first ${files.length}):\n${files.map((file) => `- ${file}`).join('\n') || '- No project files found.'}`;
  }

  private async referenceContext(request: vscode.ChatRequest, projectPath?: string): Promise<string> {
    if (!projectPath || !request.references.length) return 'Referenced files: none.';
    const chunks: string[] = [];
    for (const reference of request.references.slice(0, 3)) {
      const value = reference.value;
      const uri = value instanceof vscode.Uri ? value : value instanceof vscode.Location ? value.uri : undefined;
      if (!uri || uri.scheme !== 'file') continue;
      const resolved = path.resolve(uri.fsPath);
      if (resolved !== projectPath && !resolved.startsWith(`${projectPath}${path.sep}`)) continue;
      try {
        const content = await fs.readFile(resolved, 'utf8');
        chunks.push(`Referenced file: ${path.relative(projectPath, resolved)}\n${content.slice(0, 12000)}`);
      } catch { /* Ignore references that cannot be read. */ }
    }
    return chunks.length ? chunks.join('\n\n') : 'Referenced files: none readable.';
  }

  private async invokeTool(
    name: string,
    input: object,
    request: vscode.ChatRequest,
    token: vscode.CancellationToken,
  ): Promise<vscode.LanguageModelToolResult> {
    const invoke = (vscode.lm as typeof vscode.lm & { invokeTool?: Function }).invokeTool;
    if (typeof invoke === 'function') {
      return invoke.call(vscode.lm, name, { input, toolInvocationToken: request.toolInvocationToken }, token);
    }

    const projectPath = String((input as { projectPath?: unknown }).projectPath || '');
    if (name === 'automationStudio_build_object_repository') {
      return toolResult(await this.service.buildObjectRepository(input as unknown as BuildObjectRepositoryOptions));
    }
    if (name === 'automationStudio_analyze_object') {
      return toolResult(await this.service.analyzeObject(input as unknown as AnalyzeObjectOptions));
    }
    if (name === 'automationStudio_generate_gherkin_hierarchy') {
      return toolResult(await this.service.generateGherkin(input as unknown as GherkinOptions));
    }
    if (name === 'automationStudio_requirements_to_tests') {
      return toolResult(await this.aiService.generateTestsFromRequirements(input as unknown as RequirementsToTestsOptions));
    }
    if (name === 'automationStudio_test_design') {
      return toolResult(await this.aiService.designTestStrategy(input as unknown as TestDesignOptions));
    }
    if (name === 'automationStudio_rca') {
      return toolResult(await this.aiService.analyzeFailure(input as unknown as RCAOptions));
    }
    if (name === 'automationStudio_self_heal') {
      const healInput = input as unknown as SelfHealInput;
      return toolResult(await this.aiService.healLocators({ ...healInput, projectPath: healInput.projectPath || '', dryRun: healInput.dryRun ?? !healInput.write }));
    }
    if (name === 'automationStudio_release_readiness') {
      return toolResult(await this.aiService.assessReleaseReadiness(input as unknown as ReleaseReadinessOptions));
    }
    if (name === 'automationStudio_orchestrate') {
      return toolResult(await this.aiService.runOrchestration(input as unknown as OrchestrationOptions));
    }
    throw new Error(`Unsupported Automation Studio tool: ${name} (${projectPath})`);
  }

  private capabilityFallback(projectPath?: string): string {
    return [
      '**Automation Studio assistant** (Offline/No Model available)',
      '',
      projectPath ? `Current project: \`${projectPath}\`` : 'No project is currently open.',
      '',
      'I can explain testing and automation processes, inspect project structure, build or preview the Object Repository, analyze locators, generate Gherkin, and help with Playwright, Surface automation, OCR, reports, debugging, and runtime health.',
      '',
      '**AI Agents available:**',
      '',
      '| Agent | Example prompt |',
      '|-------|---------------|',
      '| Requirements → Tests | *"Generate tests from requirements: User can login"* |',
      '| Test Design | *"Design a test strategy for the current project"* |',
      '| Root Cause Analysis | *"Why did the last test fail?"* |',
      '| Self-Healing | *"Heal broken locators from recent failures"* |',
      '| Release Readiness | *"Is this release ready?"* |',
      '| Multi-Agent Pipeline | *"Run the full agent pipeline"* |',
      '',
      'To perform conversational automation generation, ensure you have an active internet connection to reach a Copilot model.',
    ].join('\n');
  }

  private extractScenarioName(prompt: string): string | undefined {
    return prompt.match(/(?:called|named|scenario)\s+["']?([^"']+?)["']?(?:\s|$)/i)?.[1]?.trim();
  }

  private objectRepositoryMarkdown(result: vscode.LanguageModelToolResult, write: boolean): string {
    const data = this.readToolResult(result) as { objects?: Array<{ id: string; type: string; name: string }>; created?: string[]; updated?: string[]; scenarioFiles?: string[] };
    const objects = data.objects || [];
    return [
      `### Unified Object Repository ${write ? 'saved' : 'preview'}`,
      '',
      `Found **${objects.length}** object candidates across **${data.scenarioFiles?.length || 0}** scenario file(s).`,
      write ? `Created: **${data.created?.length || 0}**, updated: **${data.updated?.length || 0}**.` : 'No files were changed. Ask me to save it after reviewing the preview.',
      '',
      objects.length ? objects.slice(0, 30).map((object) => `- \`${object.id}\` — ${object.type} — ${object.name}`).join('\n') : '_No element objects were found._',
    ].join('\n');
  }

  private analyzeMarkdown(result: vscode.LanguageModelToolResult): string {
    const data = this.readToolResult(result) as { object?: { id: string; name: string; type: string; pw?: unknown; surface?: unknown[] }; proposed?: unknown; written?: boolean };
    if (!data.object) return 'Object not found. Build the Object Repository first or provide an existing `object://...` ID.';
    return [`### Object analysis: \`${data.object.id}\``, '', `- Name: ${data.object.name}`, `- Type: ${data.object.type}`, `- Playwright locator: \`${JSON.stringify(data.object.pw || {})}\``, `- Surface locators: **${data.object.surface?.length || 0}**`, data.written ? '- Manual correction saved.' : '- Preview only; no changes were saved.'].join('\n');
  }

  private gherkinMarkdown(result: vscode.LanguageModelToolResult): string {
    const data = this.readToolResult(result) as { featurePath: string; feature: string; written?: boolean };
    return [`### Gherkin hierarchy ${data.written ? 'saved' : 'preview'}`, '', `Target: \`${data.featurePath}\``, data.written ? 'The feature file was saved in the current project.' : 'No file was changed. Review the preview, then ask me to save it.', '', '```gherkin', data.feature, '```'].join('\n');
  }

  // ── AI Agent markdown formatters ──────────────────────────────────────

  private requirementsToTestsMarkdown(result: vscode.LanguageModelToolResult): string {
    const data = this.readToolResult(result) as RequirementsToTestsResult;
    const scenarios = data.scenarios || [];
    const lines = [`### Requirements → Tests ${data.written ? '(saved)' : '(preview)'}`, '', `Generated **${scenarios.length}** scenario(s).`];
    for (const scenario of scenarios) {
      lines.push('', `#### ${scenario.name}`, '', `**Steps:** ${scenario.steps.length}`);
      for (const step of scenario.steps.slice(0, 15)) {
        lines.push(`- \`${step.type}\` — ${step.description}${step.target ? ` → \`${step.target}\`` : ''}`);
      }
      if (scenario.gherkin) {
        lines.push('', '```gherkin', scenario.gherkin.trim(), '```');
      }
    }
    if (data.written) {
      if (data.featurePath) lines.push('', `Feature saved: \`${data.featurePath}\``);
      if (data.scenarioPath) lines.push(`Scenario saved: \`${data.scenarioPath}\``);
    } else {
      lines.push('', '_Preview only. Ask me to save the generated tests._');
    }
    return lines.join('\n');
  }

  private testDesignMarkdown(result: vscode.LanguageModelToolResult): string {
    const data = this.readToolResult(result) as TestDesignResult;
    const lines = ['### Test Design Strategy', '', `**Existing scenarios:** ${data.existingScenarios?.length || 0}`];
    if (data.existingScenarios?.length) {
      lines.push(...data.existingScenarios.slice(0, 10).map(s => `- ${s}`));
    }
    lines.push('', '#### Coverage Matrix', '');
    lines.push('| Action Type | Covered | Scenarios |', '|---|---|---|');
    for (const entry of data.coverageMatrix || []) {
      lines.push(`| ${entry.area} | ${entry.covered ? '✅' : '❌'} | ${entry.scenarios.slice(0, 3).join(', ') || '—'} |`);
    }
    if (data.gaps?.length) {
      lines.push('', `#### Coverage Gaps (${data.gaps.length})`, '', ...data.gaps.map(g => `- ❌ **${g}** — no tests cover this action type`));
    }
    if (data.suggestedScenarios?.length) {
      lines.push('', '#### Suggested Scenarios', '');
      for (const s of data.suggestedScenarios) {
        lines.push(`- **${s.name}** (${s.priority} priority, ${s.type}) — ${s.rationale}`);
      }
    }
    if (data.riskAreas?.length) {
      lines.push('', '#### ⚠️ Risk Areas', '', ...data.riskAreas.map(r => `- ${r}`));
    }
    return lines.join('\n');
  }

  private rcaMarkdown(result: vscode.LanguageModelToolResult): string {
    const data = this.readToolResult(result) as RCAResult;
    if (data.status === 'passed') return '### Root Cause Analysis\n\n✅ The last execution **passed** — no failure to analyze.';
    const lines = [
      '### Root Cause Analysis', '',
      `**Execution:** \`${data.executionId}\``,
      `**Status:** ❌ Failed`,
      `**Root cause:** \`${data.rootCause}\``, '',
    ];
    if (data.failedStep) {
      lines.push(`**Failed at step ${data.failedStep.index + 1}:** ${data.failedStep.name}`, '', '```', data.failedStep.error, '```', '');
    }
    lines.push('#### Explanation', '', data.explanation, '', '#### Suggested Fix', '', data.suggestedFix);
    if (data.affectedObjects?.length) {
      lines.push('', '#### Affected Objects', '', ...data.affectedObjects.map(o => `- \`${o}\``));
    }
    return lines.join('\n');
  }

  private selfHealMarkdown(result: vscode.LanguageModelToolResult): string {
    const data = this.readToolResult(result) as SelfHealResult;
    if (!data.healed?.length) return '### Self-Healing\n\n✅ No broken locators detected in recent failures.';
    const lines = [
      `### Self-Healing ${data.scenarioUpdated ? '(applied)' : '(dry run)'}`, '',
      `Found **${data.healed.length}** locator(s) to heal:`, '',
      '| Step | Old Locator | New Locator | Strategy | Confidence |',
      '|---|---|---|---|---|',
    ];
    for (const h of data.healed) {
      lines.push(`| \`${h.stepId.slice(0, 8)}\` | \`${h.oldLocator}\` | \`${h.newLocator}\` | ${h.strategy} | ${h.confidence}% |`);
    }
    if (data.objectsUpdated?.length) {
      lines.push('', `**Objects updated:** ${data.objectsUpdated.map(o => `\`${o}\``).join(', ')}`);
    }
    if (!data.scenarioUpdated) {
      lines.push('', '_Dry run — no files changed. Ask me to "apply" or "fix" to write the healed locators._');
    }
    return lines.join('\n');
  }

  private releaseReadinessMarkdown(result: vscode.LanguageModelToolResult): string {
    const data = this.readToolResult(result) as ReleaseReadinessResult;
    const verdictEmoji = data.verdict === 'GO' ? '🟢' : data.verdict === 'CONDITIONAL' ? '🟡' : '🔴';
    const lines = [
      `### Release Readiness: ${verdictEmoji} ${data.verdict}`, '',
      '| Metric | Value |', '|---|---|',
      `| Total scenarios | ${data.totalScenarios} |`,
      `| Total executions | ${data.totalExecutions} |`,
      `| Passed | ${data.passed} |`,
      `| Failed | ${data.failed} |`,
      `| Skipped | ${data.skipped} |`,
    ];
    if (data.flaky?.length) {
      lines.push('', '#### Flaky Tests', '', '| Test | Fail Rate |', '|---|---|');
      for (const f of data.flaky.slice(0, 10)) {
        lines.push(`| ${f.name} | ${f.failRate}% |`);
      }
    }
    if (data.coverageGaps?.length) {
      lines.push('', '#### Coverage Gaps', '', ...data.coverageGaps.map(g => `- ${g}`));
    }
    lines.push('', '#### Verdict Reasons', '', ...data.reasons.map(r => `- ${r}`));
    return lines.join('\n');
  }

  private orchestrationMarkdown(result: vscode.LanguageModelToolResult): string {
    const data = this.readToolResult(result) as OrchestrationResult;
    const statusEmoji = data.overallStatus === 'passed' ? '✅' : '❌';
    const lines = [
      `### Multi-Agent Orchestration ${statusEmoji}`, '',
      `Pipeline: ${data.steps.map(s => s.agent).join(' → ')}`, '',
      '| Agent | Status | Duration | Summary |', '|---|---|---|---|',
    ];
    for (const step of data.steps) {
      const emoji = step.status === 'passed' ? '✅' : step.status === 'skipped' ? '⏭️' : '❌';
      lines.push(`| ${step.agent} | ${emoji} ${step.status} | ${step.durationMs}ms | ${step.summary.slice(0, 100)} |`);
    }
    lines.push('', `**Recommendation:** ${data.recommendation}`);
    return lines.join('\n');
  }

  // ── Shared helpers ───────────────────────────────────────────────────

  private readToolResult(result: vscode.LanguageModelToolResult): unknown {
    const part = result.content.find((item): item is vscode.LanguageModelTextPart => item instanceof vscode.LanguageModelTextPart);
    try { return JSON.parse(part?.value || '{}'); } catch { return {}; }
  }

  private escapeMarkdown(value: string): string {
    return value.replace(/[\\`*_{}[\]()<>#+.!|\-]/g, '\\$&');
  }
}

abstract class AgentTool<T> implements vscode.LanguageModelTool<T> {
  constructor(protected readonly service: AutomationStudioAgentService, protected readonly currentProject: () => string | undefined) {}

  public abstract invoke(options: vscode.LanguageModelToolInvocationOptions<T>, token: vscode.CancellationToken): vscode.ProviderResult<vscode.LanguageModelToolResult>;

  public prepareInvocation(options: vscode.LanguageModelToolInvocationPrepareOptions<T>): vscode.PreparedToolInvocation {
    const input = options.input as T & { write?: boolean };
    return {
      invocationMessage: 'Running Automation Studio agent…',
      ...(input.write ? { confirmationMessages: { title: 'Write Automation Studio project files?', message: 'This agent will update files in the current Automation Studio project.' } } : {}),
    };
  }

  protected projectPath(inputPath?: string): string {
    const currentProject = this.currentProject();
    if (inputPath && currentProject && path.resolve(inputPath) !== path.resolve(currentProject)) {
      throw new Error('Agent projectPath must match the currently opened Automation Studio project.');
    }
    const projectPath = inputPath || currentProject;
    if (!projectPath) throw new Error('Open or create an Automation Studio project first.');
    return projectPath;
  }
}

class BuildObjectRepositoryTool extends AgentTool<BuildRepositoryInput> {
  public async invoke(options: vscode.LanguageModelToolInvocationOptions<BuildRepositoryInput>): Promise<vscode.LanguageModelToolResult> {
    const input = options.input;
    const result = await this.service.buildObjectRepository({ ...input, projectPath: this.projectPath(input.projectPath) } as BuildObjectRepositoryOptions);
    return toolResult(result);
  }
}

class AnalyzeObjectTool extends AgentTool<AnalyzeObjectInput> {
  public async invoke(options: vscode.LanguageModelToolInvocationOptions<AnalyzeObjectInput>): Promise<vscode.LanguageModelToolResult> {
    const input = options.input;
    const result = await this.service.analyzeObject({ ...input, projectPath: this.projectPath(input.projectPath) });
    return toolResult(result);
  }
}

class GenerateGherkinTool extends AgentTool<GherkinInput> {
  public async invoke(options: vscode.LanguageModelToolInvocationOptions<GherkinInput>): Promise<vscode.LanguageModelToolResult> {
    const input = options.input;
    const result = await this.service.generateGherkin({ ...input, projectPath: this.projectPath(input.projectPath) });
    return toolResult(result);
  }
}

// ── AI Agent Tool Wrappers ────────────────────────────────────────────────

abstract class AIAgentTool<T> implements vscode.LanguageModelTool<T> {
  constructor(protected readonly aiService: AIAgentService, protected readonly currentProject: () => string | undefined) {}

  public abstract invoke(options: vscode.LanguageModelToolInvocationOptions<T>, token: vscode.CancellationToken): vscode.ProviderResult<vscode.LanguageModelToolResult>;

  public prepareInvocation(options: vscode.LanguageModelToolInvocationPrepareOptions<T>): vscode.PreparedToolInvocation {
    const input = options.input as T & { write?: boolean; dryRun?: boolean };
    const isWrite = input.write || (input.dryRun === false);
    return {
      invocationMessage: 'Running Automation Studio AI agent…',
      ...(isWrite ? { confirmationMessages: { title: 'Write Automation Studio project files?', message: 'This AI agent will update files in the current Automation Studio project.' } } : {}),
    };
  }

  protected projectPath(inputPath?: string): string {
    const currentProject = this.currentProject();
    if (inputPath && currentProject && path.resolve(inputPath) !== path.resolve(currentProject)) {
      throw new Error('Agent projectPath must match the currently opened Automation Studio project.');
    }
    const projectPath = inputPath || currentProject;
    if (!projectPath) throw new Error('Open or create an Automation Studio project first.');
    return projectPath;
  }
}

class RequirementsToTestsTool extends AIAgentTool<RequirementsInput> {
  public async invoke(options: vscode.LanguageModelToolInvocationOptions<RequirementsInput>): Promise<vscode.LanguageModelToolResult> {
    const input = options.input;
    const result = await this.aiService.generateTestsFromRequirements({ ...input, projectPath: this.projectPath(input.projectPath) });
    return toolResult(result);
  }
}

class TestDesignTool extends AIAgentTool<TestDesignInput> {
  public async invoke(options: vscode.LanguageModelToolInvocationOptions<TestDesignInput>): Promise<vscode.LanguageModelToolResult> {
    const input = options.input;
    const result = await this.aiService.designTestStrategy({ ...input, projectPath: this.projectPath(input.projectPath) });
    return toolResult(result);
  }
}

class RCATool extends AIAgentTool<RCAInput> {
  public async invoke(options: vscode.LanguageModelToolInvocationOptions<RCAInput>): Promise<vscode.LanguageModelToolResult> {
    const input = options.input;
    const result = await this.aiService.analyzeFailure({ ...input, projectPath: this.projectPath(input.projectPath) });
    return toolResult(result);
  }
}

class SelfHealTool extends AIAgentTool<SelfHealInput> {
  public async invoke(options: vscode.LanguageModelToolInvocationOptions<SelfHealInput>): Promise<vscode.LanguageModelToolResult> {
    const input = options.input;
    const result = await this.aiService.healLocators({ ...input, projectPath: this.projectPath(input.projectPath), dryRun: input.dryRun ?? !input.write });
    return toolResult(result);
  }
}

class ReleaseReadinessTool extends AIAgentTool<ReleaseReadinessInput> {
  public async invoke(options: vscode.LanguageModelToolInvocationOptions<ReleaseReadinessInput>): Promise<vscode.LanguageModelToolResult> {
    const input = options.input;
    const result = await this.aiService.assessReleaseReadiness({ ...input, projectPath: this.projectPath(input.projectPath) });
    return toolResult(result);
  }
}

class OrchestrateTool extends AIAgentTool<OrchestrationInput> {
  public async invoke(options: vscode.LanguageModelToolInvocationOptions<OrchestrationInput>): Promise<vscode.LanguageModelToolResult> {
    const input = options.input;
    const result = await this.aiService.runOrchestration({ ...input, projectPath: this.projectPath(input.projectPath) });
    return toolResult(result);
  }
}
