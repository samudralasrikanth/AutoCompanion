import { promises as fsAsync } from 'node:fs';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  UnifiedFileSystemObjectRepository,
  type IScenario,
  type IStep,
  type UnifiedObject,
} from '@automation-studio/sdk';
import type { AgentMode } from './automation-studio-agent-service';

// ──────────────────────────────────────────────────────────────────────────────
// Requirements-to-Tests
// ──────────────────────────────────────────────────────────────────────────────

export interface RequirementsToTestsOptions {
  projectPath: string;
  text?: string;
  filePath?: string;
  mode?: AgentMode;
  scenarioName?: string;
  write?: boolean;
}

interface GeneratedStep {
  type: string;
  description: string;
  target?: string;
  value?: string;
}

interface GeneratedScenario {
  name: string;
  steps: GeneratedStep[];
  gherkin: string;
}

export interface RequirementsToTestsResult {
  projectPath: string;
  scenarios: GeneratedScenario[];
  featurePath?: string;
  scenarioPath?: string;
  written: boolean;
}

// ──────────────────────────────────────────────────────────────────────────────
// Test Design
// ──────────────────────────────────────────────────────────────────────────────

export interface TestDesignOptions {
  projectPath: string;
  scope?: string;
  coverageGoal?: 'smoke' | 'regression' | 'full';
  includeEdgeCases?: boolean;
}

interface CoverageEntry {
  area: string;
  covered: boolean;
  scenarios: string[];
}

interface SuggestedScenario {
  name: string;
  type: string;
  priority: 'high' | 'medium' | 'low';
  rationale: string;
}

export interface TestDesignResult {
  projectPath: string;
  existingScenarios: string[];
  coverageMatrix: CoverageEntry[];
  gaps: string[];
  suggestedScenarios: SuggestedScenario[];
  riskAreas: string[];
}

// ──────────────────────────────────────────────────────────────────────────────
// RCA — Root Cause Analysis
// ──────────────────────────────────────────────────────────────────────────────

export interface RCAOptions {
  projectPath: string;
  executionId?: string;
  reportPath?: string;
}

type RootCauseCategory = 'locator_stale' | 'timing' | 'navigation' | 'data' | 'environment' | 'unknown';

export interface RCAResult {
  projectPath: string;
  executionId: string;
  status: 'passed' | 'failed';
  failedStep?: { index: number; name: string; error: string; screenshot?: string };
  rootCause: RootCauseCategory;
  explanation: string;
  suggestedFix: string;
  affectedObjects: string[];
}

// ──────────────────────────────────────────────────────────────────────────────
// Self-Healing
// ──────────────────────────────────────────────────────────────────────────────

export interface SelfHealOptions {
  projectPath: string;
  scenarioPath?: string;
  failedStepId?: string;
  dryRun?: boolean;
}

type HealStrategy = 'id_fallback' | 'name_fallback' | 'text_match' | 'role_match' | 'data_testid';

interface HealedLocator {
  stepId: string;
  objectId?: string;
  oldLocator: string;
  newLocator: string;
  strategy: HealStrategy;
  confidence: number;
}

export interface SelfHealResult {
  projectPath: string;
  healed: HealedLocator[];
  scenarioUpdated: boolean;
  objectsUpdated: string[];
}

// ──────────────────────────────────────────────────────────────────────────────
// Release Readiness
// ──────────────────────────────────────────────────────────────────────────────

export interface ReleaseReadinessOptions {
  projectPath: string;
  passThreshold?: number;
  maxFlakyPercent?: number;
}

type ReleaseVerdict = 'GO' | 'NO_GO' | 'CONDITIONAL';

export interface ReleaseReadinessResult {
  projectPath: string;
  totalScenarios: number;
  totalExecutions: number;
  passed: number;
  failed: number;
  skipped: number;
  flaky: Array<{ name: string; failRate: number }>;
  coverageGaps: string[];
  verdict: ReleaseVerdict;
  reasons: string[];
}

// ──────────────────────────────────────────────────────────────────────────────
// Multi-Agent Orchestration
// ──────────────────────────────────────────────────────────────────────────────

export type OrchestrationStep = 'requirements' | 'design' | 'heal' | 'rca' | 'readiness';

export interface OrchestrationOptions {
  projectPath: string;
  pipeline?: OrchestrationStep[];
  write?: boolean;
}

interface OrchestrationStepResult {
  agent: string;
  status: 'passed' | 'failed' | 'skipped';
  durationMs: number;
  summary: string;
  result?: unknown;
}

export interface OrchestrationResult {
  projectPath: string;
  steps: OrchestrationStepResult[];
  overallStatus: 'passed' | 'failed';
  recommendation: string;
}

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

interface ExecutionReport {
  executionId: string;
  status: 'passed' | 'failed';
  duration: number;
  timestamp: string;
  errorCode?: string;
  error?: string;
  steps: Array<{ name: string; status: string; durationMs: number; error?: string; errorCode?: string; screenshot?: string }>;
}

// ──────────────────────────────────────────────────────────────────────────────
// Service
// ──────────────────────────────────────────────────────────────────────────────

/**
 * AI agent service with six deterministic agents.
 *
 * All methods are pure functions of the project's file system and produce
 * structured results. No VS Code or LLM dependency.
 */
export class AIAgentService {

  // ── Requirements-to-Tests ──────────────────────────────────────────────

  public async generateTestsFromRequirements(options: RequirementsToTestsOptions): Promise<RequirementsToTestsResult> {
    const projectPath = path.resolve(options.projectPath);
    const source = options.text?.trim() || (options.filePath ? (await fsAsync.readFile(this.safePath(projectPath, options.filePath), 'utf8')).trim() : '');
    if (!source) throw new Error('Provide requirement text or a file path to generate tests.');

    const blocks = this.splitRequirementBlocks(source);
    const scenarios: GeneratedScenario[] = [];

    for (let index = 0; index < blocks.length; index++) {
      const block = blocks[index]!;
      const name = options.scenarioName && blocks.length === 1
        ? options.scenarioName
        : this.extractScenarioName(block) || `${options.scenarioName || 'Scenario'} ${index + 1}`;
      const steps = this.requirementToSteps(block);
      const gherkin = this.stepsToGherkin(name, steps);
      scenarios.push({ name, steps, gherkin });
    }

    let featurePath: string | undefined;
    let scenarioPath: string | undefined;

    if (options.write && scenarios.length) {
      const scenariosDir = path.join(projectPath, 'automation', 'scenarios');
      fs.mkdirSync(scenariosDir, { recursive: true });
      const baseName = this.slug(scenarios[0]!.name);

      // Write Gherkin feature
      featurePath = path.join(scenariosDir, `${baseName}.feature`);
      const featureContent = scenarios.map(s => s.gherkin).join('\n\n');
      fs.writeFileSync(featurePath, featureContent, 'utf8');

      // Write scenario.json
      scenarioPath = path.join(scenariosDir, `${baseName}.scenario.json`);
      const mode = options.mode === 'surface' ? 'surface' : 'playwright';
      const scenario: IScenario = {
        id: randomUUID(),
        name: scenarios[0]!.name,
        description: `Generated from requirements by AI Agent`,
        mode,
        metadata: { schemaVersion: '1.0', createdBy: 'AI Agent: Requirements-to-Tests', platformVersion: '0.1.9' },
        steps: scenarios.flatMap(s => s.steps.map((step, i) => ({
          id: randomUUID(),
          type: step.type as IStep['type'],
          target: step.target,
          description: step.description,
          parameters: step.value ? [{ name: 'value', value: step.value }] : undefined,
        }))),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      fs.writeFileSync(scenarioPath, JSON.stringify(scenario, null, 2), 'utf8');
    }

    return { projectPath, scenarios, featurePath, scenarioPath, written: Boolean(options.write && scenarios.length) };
  }

  // ── Test Design ────────────────────────────────────────────────────────

  public async designTestStrategy(options: TestDesignOptions): Promise<TestDesignResult> {
    const projectPath = path.resolve(options.projectPath);
    const scenarioFiles = await this.findScenarioFiles(projectPath);
    const existingScenarios: string[] = [];
    const actionCoverage = new Map<string, string[]>();

    for (const file of scenarioFiles) {
      try {
        const scenario = JSON.parse(fs.readFileSync(file, 'utf8')) as IScenario;
        existingScenarios.push(scenario.name || path.basename(file));
        const steps = this.flattenSteps(scenario.steps || []);
        for (const step of steps) {
          const area = step.type || 'unknown';
          const existing = actionCoverage.get(area) || [];
          existing.push(scenario.name);
          actionCoverage.set(area, existing);
        }
      } catch { /* skip unparseable */ }
    }

    // Build coverage matrix
    const allAreas = ['navigate', 'click', 'type', 'select', 'verify', 'uploadFile', 'hover', 'check', 'uncheck', 'screenshot', 'apiRequest', 'loop', 'excelLoop'];
    const coverageMatrix: CoverageEntry[] = allAreas.map(area => ({
      area,
      covered: actionCoverage.has(area),
      scenarios: actionCoverage.get(area) || [],
    }));

    const gaps = coverageMatrix.filter(entry => !entry.covered).map(entry => entry.area);

    // Suggest scenarios based on gaps and coverage goal
    const suggestedScenarios: SuggestedScenario[] = [];
    const goal = options.coverageGoal || 'regression';

    if (!actionCoverage.has('navigate')) {
      suggestedScenarios.push({ name: 'Navigation Smoke Test', type: 'smoke', priority: 'high', rationale: 'No navigate steps found — basic page navigation is untested.' });
    }
    if (!actionCoverage.has('type')) {
      suggestedScenarios.push({ name: 'Form Input Validation', type: 'functional', priority: 'high', rationale: 'No text input steps found — form data entry is untested.' });
    }
    if (!actionCoverage.has('verify') && !actionCoverage.has('assertText')) {
      suggestedScenarios.push({ name: 'Assertion Coverage', type: 'assertion', priority: 'high', rationale: 'No verification steps found — test outcomes are not validated.' });
    }
    if (!actionCoverage.has('apiRequest') && (goal === 'regression' || goal === 'full')) {
      suggestedScenarios.push({ name: 'API Health Check', type: 'api', priority: 'medium', rationale: 'No API request steps — backend health is not validated.' });
    }
    if (options.includeEdgeCases || goal === 'full') {
      suggestedScenarios.push(
        { name: 'Empty Input Boundary Test', type: 'edge', priority: 'medium', rationale: 'Edge case: empty or whitespace-only inputs.' },
        { name: 'Long Input Boundary Test', type: 'edge', priority: 'low', rationale: 'Edge case: very long input values exceeding normal limits.' },
        { name: 'Special Characters Input', type: 'edge', priority: 'low', rationale: 'Edge case: special characters and Unicode in inputs.' },
      );
    }

    const riskAreas: string[] = [];
    if (existingScenarios.length === 0) riskAreas.push('No existing scenarios — the project has zero test coverage.');
    if (existingScenarios.length > 0 && existingScenarios.length < 3) riskAreas.push('Very few scenarios — coverage is likely incomplete.');
    if (gaps.length > 5) riskAreas.push(`${gaps.length} action types are untested — significant gaps remain.`);

    return { projectPath, existingScenarios, coverageMatrix, gaps, suggestedScenarios, riskAreas };
  }

  // ── RCA ─────────────────────────────────────────────────────────────────

  public async analyzeFailure(options: RCAOptions): Promise<RCAResult> {
    const projectPath = path.resolve(options.projectPath);
    const report = await this.loadReport(projectPath, options.executionId, options.reportPath);

    if (report.status === 'passed') {
      return {
        projectPath, executionId: report.executionId, status: 'passed',
        rootCause: 'unknown', explanation: 'The execution passed — no failure to analyze.',
        suggestedFix: 'N/A', affectedObjects: [],
      };
    }

    const failedStepIndex = report.steps.findIndex(s => s.status === 'failed');
    const failedStep = failedStepIndex >= 0 ? report.steps[failedStepIndex]! : undefined;
    const errorText = failedStep?.error || report.error || '';
    const errorCode = failedStep?.errorCode || report.errorCode;

    const rootCause = this.classifyRootCause(errorText, errorCode);
    const explanation = this.explainRootCause(rootCause, errorText, failedStep?.name || '');
    const suggestedFix = this.suggestFix(rootCause, errorText);
    const affectedObjects = this.extractObjectReferences(errorText);

    return {
      projectPath,
      executionId: report.executionId,
      status: 'failed',
      failedStep: failedStep ? { index: failedStepIndex, name: failedStep.name, error: failedStep.error || errorText, screenshot: failedStep.screenshot } : undefined,
      rootCause, explanation, suggestedFix, affectedObjects,
    };
  }

  // ── Self-Healing ───────────────────────────────────────────────────────

  public async healLocators(options: SelfHealOptions): Promise<SelfHealResult> {
    const projectPath = path.resolve(options.projectPath);
    const scenarioFiles = options.scenarioPath
      ? [this.safePath(projectPath, options.scenarioPath)]
      : await this.findScenarioFiles(projectPath);

    const healed: HealedLocator[] = [];
    const objectsUpdated: string[] = [];
    let scenarioUpdated = false;

    // Load recent failure reports to find broken locators
    const failedLocators = await this.findFailedLocators(projectPath);

    for (const file of scenarioFiles) {
      let scenario: IScenario;
      try { scenario = JSON.parse(fs.readFileSync(file, 'utf8')) as IScenario; } catch { continue; }

      let modified = false;
      const steps = this.flattenSteps(scenario.steps || []);

      for (const step of steps) {
        if (options.failedStepId && step.id !== options.failedStepId) continue;
        const target = step.target || '';
        if (!target || !failedLocators.has(target)) continue;

        const alternatives = this.generateAlternativeLocators(target, step);
        if (!alternatives.length) continue;

        const best = alternatives[0]!;
        healed.push({
          stepId: step.id,
          objectId: target.startsWith('object://') ? target.replace('object://', '') : undefined,
          oldLocator: target,
          newLocator: best.locator,
          strategy: best.strategy,
          confidence: best.confidence,
        });

        if (!options.dryRun) {
          step.target = best.locator;
          step.locatorFallback = [{ strategy: best.strategy, value: best.locator }, ...(step.locatorFallback || [])];
          modified = true;
        }
      }

      if (modified && !options.dryRun) {
        scenario.updatedAt = Date.now();
        fs.writeFileSync(file, JSON.stringify(scenario, null, 2), 'utf8');
        scenarioUpdated = true;
      }
    }

    // Also update object repository if applicable
    if (!options.dryRun && healed.length) {
      const repository = new UnifiedFileSystemObjectRepository(projectPath);
      for (const heal of healed) {
        if (!heal.objectId) continue;
        const object = await repository.getObject(`object://${heal.objectId}`);
        if (!object) continue;
        if (object.pw) {
          object.pw.css = heal.newLocator;
        }
        await repository.save(object, 'AI Agent: Self-Healing', `Auto-healed locator using ${heal.strategy}`);
        objectsUpdated.push(heal.objectId);
      }
    }

    return { projectPath, healed, scenarioUpdated, objectsUpdated };
  }

  // ── Release Readiness ──────────────────────────────────────────────────

  public async assessReleaseReadiness(options: ReleaseReadinessOptions): Promise<ReleaseReadinessResult> {
    const projectPath = path.resolve(options.projectPath);
    const passThreshold = options.passThreshold ?? 95;
    const maxFlakyPercent = options.maxFlakyPercent ?? 5;

    // Gather all scenarios
    const scenarioFiles = await this.findScenarioFiles(projectPath);
    const totalScenarios = scenarioFiles.length;

    // Gather all reports (last 10 per scenario for flaky detection)
    const reportsDir = path.join(projectPath, '.automationstudio', 'reports');
    const reports = await this.loadAllReports(reportsDir, 10);

    let passed = 0;
    let failed = 0;
    const skipped = 0;
    const scenarioResults = new Map<string, { passes: number; failures: number }>();

    for (const report of reports) {
      if (report.status === 'passed') passed++;
      else failed++;

      // Track per-step results for flaky detection
      for (const step of report.steps) {
        const key = step.name;
        const current = scenarioResults.get(key) || { passes: 0, failures: 0 };
        if (step.status === 'passed') current.passes++;
        else current.failures++;
        scenarioResults.set(key, current);
      }
    }

    // Flaky detection: steps that pass sometimes and fail sometimes
    const flaky: Array<{ name: string; failRate: number }> = [];
    for (const [name, stats] of scenarioResults) {
      const total = stats.passes + stats.failures;
      if (total < 2) continue;
      const failRate = Math.round((stats.failures / total) * 100);
      if (failRate > 0 && failRate < 100) {
        flaky.push({ name, failRate });
      }
    }
    flaky.sort((a, b) => b.failRate - a.failRate);

    // Coverage gaps
    const coverageGaps: string[] = [];
    if (totalScenarios === 0) coverageGaps.push('No scenarios exist in the project.');
    if (reports.length === 0) coverageGaps.push('No execution reports found — scenarios have never been run.');

    // Verdict
    const totalExecutions = reports.length;
    const passRate = totalExecutions > 0 ? Math.round((passed / totalExecutions) * 100) : 0;
    const flakyPercent = totalExecutions > 0 ? Math.round((flaky.length / Math.max(scenarioResults.size, 1)) * 100) : 0;

    const reasons: string[] = [];
    let verdict: ReleaseVerdict = 'GO';

    if (totalScenarios === 0 || totalExecutions === 0) {
      verdict = 'NO_GO';
      reasons.push('Cannot assess readiness without test scenarios and execution history.');
    } else {
      if (passRate < passThreshold) {
        verdict = 'NO_GO';
        reasons.push(`Pass rate ${passRate}% is below the ${passThreshold}% threshold.`);
      }
      if (flakyPercent > maxFlakyPercent) {
        if (verdict === 'GO') verdict = 'CONDITIONAL';
        reasons.push(`Flaky rate ${flakyPercent}% exceeds the ${maxFlakyPercent}% limit (${flaky.length} flaky steps detected).`);
      }
      if (coverageGaps.length) {
        if (verdict === 'GO') verdict = 'CONDITIONAL';
        reasons.push(`Coverage gaps: ${coverageGaps.join('; ')}`);
      }
      if (verdict === 'GO') {
        reasons.push(`Pass rate ${passRate}% meets the ${passThreshold}% threshold. ${totalScenarios} scenario(s) with ${totalExecutions} execution(s).`);
      }
    }

    return { projectPath, totalScenarios, totalExecutions, passed, failed, skipped, flaky, coverageGaps, verdict, reasons };
  }

  // ── Multi-Agent Orchestration ──────────────────────────────────────────

  public async runOrchestration(options: OrchestrationOptions): Promise<OrchestrationResult> {
    const projectPath = path.resolve(options.projectPath);
    const pipeline = options.pipeline || ['heal', 'rca', 'readiness'];
    const steps: OrchestrationStepResult[] = [];
    let anyFailed = false;

    for (const agentName of pipeline) {
      const start = Date.now();
      try {
        const result = await this.runOrchestrationAgent(agentName, projectPath, options.write);
        steps.push({
          agent: agentName,
          status: 'passed',
          durationMs: Date.now() - start,
          summary: this.summarizeAgentResult(agentName, result),
          result,
        });
      } catch (error) {
        anyFailed = true;
        steps.push({
          agent: agentName,
          status: 'failed',
          durationMs: Date.now() - start,
          summary: `Failed: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    }

    const overallStatus = anyFailed ? 'failed' as const : 'passed' as const;
    const recommendation = anyFailed
      ? 'Pipeline encountered errors. Review individual agent results and re-run after fixing issues.'
      : `All ${pipeline.length} agents completed successfully. ${pipeline.includes('readiness') ? 'Check the release readiness verdict for the final assessment.' : 'Consider running the readiness agent for a final verdict.'}`;

    return { projectPath, steps, overallStatus, recommendation };
  }

  // ──────────────────────────────────────────────────────────────────────
  // Private helpers
  // ──────────────────────────────────────────────────────────────────────

  private async runOrchestrationAgent(name: OrchestrationStep, projectPath: string, write?: boolean): Promise<unknown> {
    switch (name) {
      case 'requirements':
        return { skipped: true, reason: 'Requirements-to-tests requires explicit requirement text input.' };
      case 'design':
        return this.designTestStrategy({ projectPath, coverageGoal: 'regression', includeEdgeCases: true });
      case 'heal':
        return this.healLocators({ projectPath, dryRun: !write });
      case 'rca':
        return this.analyzeFailure({ projectPath });
      case 'readiness':
        return this.assessReleaseReadiness({ projectPath });
      default:
        throw new Error(`Unknown orchestration agent: ${name}`);
    }
  }

  private summarizeAgentResult(name: string, result: unknown): string {
    if (!result || typeof result !== 'object') return 'Completed.';
    const r = result as Record<string, unknown>;
    switch (name) {
      case 'design': {
        const d = r as unknown as TestDesignResult;
        return `Found ${d.existingScenarios?.length || 0} existing scenarios, ${d.gaps?.length || 0} coverage gaps, suggested ${d.suggestedScenarios?.length || 0} new scenarios.`;
      }
      case 'heal': {
        const h = r as unknown as SelfHealResult;
        return `Healed ${h.healed?.length || 0} locator(s). ${h.scenarioUpdated ? 'Scenarios updated.' : 'Dry run — no files changed.'}`;
      }
      case 'rca': {
        const a = r as unknown as RCAResult;
        return a.status === 'passed' ? 'Last execution passed — no failure to analyze.' : `Root cause: ${a.rootCause}. ${a.explanation}`;
      }
      case 'readiness': {
        const rl = r as unknown as ReleaseReadinessResult;
        return `Verdict: ${rl.verdict}. ${rl.reasons?.[0] || ''}`;
      }
      default:
        return JSON.stringify(r).slice(0, 200);
    }
  }

  // ── Requirement parsing ────────────────────────────────────────────────

  private splitRequirementBlocks(text: string): string[] {
    // Split on numbered items, scenario boundaries, or double newlines with headers
    const blocks = text.split(/\n(?=\d+[.)]\s|(?:scenario|test case|case)\s*:)/i).filter(b => b.trim());
    return blocks.length ? blocks : [text];
  }

  private extractScenarioName(block: string): string | undefined {
    const match = block.match(/^(?:scenario|test case|case)\s*:\s*(.+)/im);
    if (match) return match[1]!.trim();
    const firstLine = block.split(/\r?\n/)[0]?.trim();
    if (firstLine && firstLine.length < 80 && !/^(given|when|then|and|but)\b/i.test(firstLine)) return firstLine;
    return undefined;
  }

  private requirementToSteps(block: string): GeneratedStep[] {
    const lines = block.split(/\r?\n/).map(l => l.trim()).filter(l => l && !/^(scenario|test case|case)\s*:/i.test(l));
    const steps: GeneratedStep[] = [];

    for (const line of lines) {
      const cleaned = line.replace(/^[-*•]\s*/, '').replace(/^\d+[.)]\s*/, '').replace(/^(given|when|then|and|but)\s+/i, '').trim();
      if (!cleaned) continue;

      if (/\b(navigate|open|go to|visit|browse)\b/i.test(cleaned)) {
        const url = cleaned.match(/(https?:\/\/\S+|['"]([^'"]+)['"])/)?.[1]?.replace(/['"]/g, '') || '';
        steps.push({ type: 'navigate', description: cleaned, value: url || undefined });
      } else if (/\b(type|fill|enter|input|write)\b.*\b(in|into|on)\b/i.test(cleaned)) {
        const value = cleaned.match(/['""]([^'""]+)['""]|value\s+(\S+)/)?.[1] || '';
        const target = cleaned.match(/(?:in|into|on)\s+(?:the\s+)?['""]?([^'"",.]+)/i)?.[1]?.trim() || '';
        steps.push({ type: 'type', description: cleaned, target, value });
      } else if (/\b(click|press|tap|hit|submit)\b/i.test(cleaned)) {
        const target = cleaned.replace(/\b(click|press|tap|hit|submit)\b\s*(on|the)?\s*/i, '').trim();
        steps.push({ type: 'click', description: cleaned, target });
      } else if (/\b(select|choose|pick)\b/i.test(cleaned)) {
        const value = cleaned.match(/['""]([^'""]+)['""]|select\s+(\S+)/i)?.[1] || '';
        const target = cleaned.match(/(?:from|in)\s+(?:the\s+)?['""]?([^'"",.]+)/i)?.[1]?.trim() || '';
        steps.push({ type: 'select', description: cleaned, target, value });
      } else if (/\b(verify|assert|check|should|expect|see|visible|displayed|shown)\b/i.test(cleaned)) {
        const target = cleaned.replace(/\b(verify|assert|check|should|expect|see|that|is|are|be)\b/gi, '').trim();
        steps.push({ type: 'verify', description: cleaned, target });
      } else if (/\b(wait|pause|delay)\b/i.test(cleaned)) {
        steps.push({ type: 'wait', description: cleaned });
      } else if (/\b(upload|attach)\b/i.test(cleaned)) {
        const value = cleaned.match(/['""]([^'""]+)['""]|upload\s+(\S+)/i)?.[1] || '';
        steps.push({ type: 'uploadFile', description: cleaned, value });
      } else if (/\b(hover|mouse over)\b/i.test(cleaned)) {
        const target = cleaned.replace(/\b(hover|mouse over)\b\s*(on|over|the)?\s*/i, '').trim();
        steps.push({ type: 'hover', description: cleaned, target });
      } else {
        // Default to click for action-like statements, verify for declarative
        if (/\b(user|i|they|we)\b.*\b(can|should|will|must)\b/i.test(cleaned)) {
          steps.push({ type: 'verify', description: cleaned, target: cleaned });
        } else {
          steps.push({ type: 'click', description: cleaned, target: cleaned });
        }
      }
    }
    return steps;
  }

  private stepsToGherkin(name: string, steps: GeneratedStep[]): string {
    const lines = [`Feature: ${name}`, '', `  Scenario: ${name}`];
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i]!;
      const prefix = i === 0 ? 'Given' : /^(verify|assert)/.test(step.type) ? 'Then' : 'When';
      const target = step.target || 'the element';
      if (step.type === 'navigate') lines.push(`    ${prefix} I navigate to ${step.value || target}`);
      else if (step.type === 'type') lines.push(`    ${prefix} I fill "${target}" with "${step.value || 'test value'}"`);
      else if (step.type === 'click') lines.push(`    ${prefix} I click "${target}"`);
      else if (step.type === 'select') lines.push(`    ${prefix} I select "${step.value}" from "${target}"`);
      else if (step.type === 'verify') lines.push(`    ${prefix} "${target}" is visible`);
      else if (step.type === 'wait') lines.push(`    ${prefix} I wait for the page to load`);
      else if (step.type === 'uploadFile') lines.push(`    ${prefix} I upload "${step.value}" into "${target}"`);
      else if (step.type === 'hover') lines.push(`    ${prefix} I hover over "${target}"`);
      else lines.push(`    ${prefix} I ${step.description}`);
    }
    return lines.join('\n') + '\n';
  }

  // ── RCA helpers ────────────────────────────────────────────────────────

  private classifyRootCause(error: string, errorCode?: string): RootCauseCategory {
    if (errorCode) {
      if (['PW_LOCATOR_TIMEOUT', 'STRICT_MODE_VIOLATION'].includes(errorCode)) return 'locator_stale';
      if (['PW_TIMEOUT'].includes(errorCode)) return 'timing';
      if (['PW_NAVIGATION', 'CONTEXT_DESTROYED'].includes(errorCode)) return 'navigation';
      if (['ASSERTION_FAILED', 'EXPECT_FAILED'].includes(errorCode)) return 'data';
      if (['ECONNREFUSED', 'DNS_FAIL'].includes(errorCode)) return 'environment';
    }
    const lower = error.toLowerCase();
    if (/strict mode violation|locator.*resolved to \d+ elements|no element.*matching|element not found|element is not visible|waiting for (locator|selector)/i.test(error)) return 'locator_stale';
    if (/timeout|timed? ?out|exceeded.*time|navigation timeout/i.test(error)) return 'timing';
    if (/navigation|net::err_|execution context was destroyed|frame.*detached|page.*closed|browser.*closed/i.test(error)) return 'navigation';
    if (/expected.*received|assertion|toBe|toHave|toContain|does not match|mismatch/i.test(error)) return 'data';
    if (/econnrefused|enotfound|dns|ssl|certificate|proxy|vpn|spawn|enoent|permission denied/i.test(error)) return 'environment';
    return 'unknown';
  }

  private explainRootCause(cause: RootCauseCategory, error: string, stepName: string): string {
    switch (cause) {
      case 'locator_stale': return `The locator in step "${stepName}" could not find its target element. This typically means the page structure changed (a UI update, different rendering, or dynamic content). The element may have a new ID, class, or DOM position.`;
      case 'timing': return `Step "${stepName}" timed out waiting for an element or navigation to complete. The page may be loading slower than expected, or an element may be rendered asynchronously after the timeout.`;
      case 'navigation': return `A navigation event (redirect, SPA route change, or page reload) disrupted step "${stepName}". The execution context was destroyed before the step could complete.`;
      case 'data': return `An assertion in step "${stepName}" failed because the actual data did not match the expected value. This may indicate a genuine regression, stale test data, or environment-specific differences.`;
      case 'environment': return `Step "${stepName}" failed due to an infrastructure issue (network connectivity, DNS resolution, SSL certificates, or missing system dependencies). This is not a test logic issue.`;
      default: return `Step "${stepName}" failed with an unrecognized error. Manual investigation is recommended. Error: ${error.slice(0, 300)}`;
    }
  }

  private suggestFix(cause: RootCauseCategory, error: string): string {
    switch (cause) {
      case 'locator_stale': return 'Run the Self-Healing agent to generate alternative locators, or manually update the locator using the Object Repository. Consider using data-testid attributes for stable selectors.';
      case 'timing': return 'Increase the step timeout, add an explicit waitForElement step before the failing step, or use waitForLoadState to ensure the page is ready.';
      case 'navigation': return 'Add a waitForNavigation step or use domcontentloaded/networkidle wait strategies. Check if the page performs unexpected redirects.';
      case 'data': return 'Verify the expected test data matches the current application state. Check if the test data source is up to date.';
      case 'environment': return 'Check network connectivity, VPN/proxy configuration, and ensure the target URL is accessible. Verify that required system dependencies are installed.';
      default: return 'Review the full error message and stack trace. Consider running the test in headed mode for visual debugging.';
    }
  }

  private extractObjectReferences(error: string): string[] {
    const refs: string[] = [];
    const objectRefs = error.match(/object:\/\/[\w.-]+/g);
    if (objectRefs) refs.push(...objectRefs);
    const selectorRefs = error.match(/#[\w-]+|\[data-testid="[\w-]+"]/g);
    if (selectorRefs) refs.push(...selectorRefs);
    return [...new Set(refs)];
  }

  // ── Self-heal helpers ──────────────────────────────────────────────────

  private async findFailedLocators(projectPath: string): Promise<Set<string>> {
    const reportsDir = path.join(projectPath, '.automationstudio', 'reports');
    const failed = new Set<string>();
    const reports = await this.loadAllReports(reportsDir, 5);
    for (const report of reports) {
      for (const step of report.steps) {
        if (step.status !== 'failed') continue;
        const error = step.error || '';
        // Extract locator from error messages
        const locator = error.match(/locator\s*['"]([^'"]+)['"]/i)?.[1]
          || error.match(/selector\s*['"]([^'"]+)['"]/i)?.[1]
          || error.match(/(#[\w-]+|\[data-testid="[^"]+"]|\.[\w-]+)/)?.[1];
        if (locator) failed.add(locator);
      }
    }
    return failed;
  }

  private generateAlternativeLocators(target: string, step: IStep): Array<{ locator: string; strategy: HealStrategy; confidence: number }> {
    const alternatives: Array<{ locator: string; strategy: HealStrategy; confidence: number }> = [];
    const description = (step.description || '').toLowerCase();
    const name = step.parameters?.find(p => p.name === 'name')?.value || '';

    // If target is an ID selector, try name-based fallback
    if (target.startsWith('#')) {
      const id = target.slice(1);
      alternatives.push({ locator: `[name="${id}"]`, strategy: 'name_fallback', confidence: 70 });
      alternatives.push({ locator: `[data-testid="${id}"]`, strategy: 'data_testid', confidence: 80 });
    }

    // Try text-based matching from the description
    if (description) {
      const textParts = description.match(/([\w\s]+)/g)?.filter(p => p.trim().length > 2) || [];
      for (const text of textParts.slice(0, 2)) {
        alternatives.push({ locator: `text=${text.trim()}`, strategy: 'text_match', confidence: 50 });
      }
    }

    // Try role-based locators
    if (step.type === 'click' || step.type === 'type') {
      const role = step.type === 'type' ? 'textbox' : 'button';
      const label = name || description.replace(/\b(click|type|fill|enter)\b/gi, '').trim();
      if (label) {
        alternatives.push({ locator: `role=${role}[name="${label}"]`, strategy: 'role_match', confidence: 60 });
      }
    }

    // Add existing fallbacks if present
    if (step.locatorFallback) {
      for (const fb of step.locatorFallback) {
        if (fb.value !== target) {
          alternatives.push({ locator: fb.value, strategy: fb.strategy as HealStrategy || 'id_fallback', confidence: 75 });
        }
      }
    }

    return alternatives.sort((a, b) => b.confidence - a.confidence);
  }

  // ── Report loading ────────────────────────────────────────────────────

  private async loadReport(projectPath: string, executionId?: string, reportPath?: string): Promise<ExecutionReport> {
    if (reportPath) {
      const resolved = this.safePath(projectPath, reportPath);
      return JSON.parse(fs.readFileSync(resolved, 'utf8')) as ExecutionReport;
    }

    const reportsDir = path.join(projectPath, '.automationstudio', 'reports');
    if (executionId) {
      const reportFile = path.join(reportsDir, executionId, 'report.json');
      if (!fs.existsSync(reportFile)) throw new Error(`Report not found for execution ${executionId}.`);
      return JSON.parse(fs.readFileSync(reportFile, 'utf8')) as ExecutionReport;
    }

    // Find the most recent report
    const reports = await this.loadAllReports(reportsDir, 1);
    if (!reports.length) throw new Error('No execution reports found. Run a flow first to generate a report.');
    return reports[0]!;
  }

  private async loadAllReports(reportsDir: string, maxPerScenario: number): Promise<ExecutionReport[]> {
    if (!fs.existsSync(reportsDir)) return [];
    const reports: ExecutionReport[] = [];
    try {
      const entries = fs.readdirSync(reportsDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const reportFile = path.join(reportsDir, entry.name, 'report.json');
        if (!fs.existsSync(reportFile)) continue;
        try {
          reports.push(JSON.parse(fs.readFileSync(reportFile, 'utf8')) as ExecutionReport);
        } catch { /* skip corrupt */ }
      }
    } catch { /* dir not readable */ }
    // Sort by timestamp descending, limit
    reports.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return reports.slice(0, maxPerScenario * 10);
  }

  // ── Shared helpers ────────────────────────────────────────────────────

  private async findScenarioFiles(projectPath: string): Promise<string[]> {
    return this.findFilesRecursive(path.join(projectPath, 'automation', 'scenarios'), '.scenario.json');
  }

  private async findFilesRecursive(directory: string, suffix: string): Promise<string[]> {
    if (!fs.existsSync(directory)) return [];
    const files: string[] = [];
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) files.push(...await this.findFilesRecursive(fullPath, suffix));
      else if (entry.isFile() && entry.name.endsWith(suffix)) files.push(fullPath);
    }
    return files.sort();
  }

  private flattenSteps(steps: IStep[]): IStep[] {
    return steps.flatMap(step => [step, ...this.flattenSteps(step.children || [])]);
  }

  private safePath(projectPath: string, candidate: string): string {
    const resolved = path.resolve(projectPath, candidate);
    if (resolved !== projectPath && !resolved.startsWith(`${projectPath}${path.sep}`)) {
      throw new Error('Path must stay inside the Automation Studio project.');
    }
    return resolved;
  }

  private slug(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'generated';
  }
}
