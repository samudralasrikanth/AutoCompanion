import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import {
  UnifiedFileSystemObjectRepository,
  type IScreenshotAttachment,
  type IScenario,
  type IStep,
  type SurfaceLocatorEvidence,
  type UnifiedObject,
  type UnifiedObjectType,
} from '@automation-studio/sdk';

export { AIAgentService } from './ai-agent-service';

export type AgentMode = 'pw' | 'surface' | 'all';

export interface BuildObjectRepositoryOptions {
  projectPath: string;
  scenarioPath?: string;
  mode?: AgentMode;
  write?: boolean;
}

export interface ObjectRepositoryBuildResult {
  projectPath: string;
  scenarioFiles: string[];
  objects: UnifiedObject[];
  created: string[];
  updated: string[];
  skipped: string[];
  writeRequested: boolean;
}

export interface AnalyzeObjectOptions {
  projectPath: string;
  objectId: string;
  write?: boolean;
  correction?: Partial<Pick<UnifiedObject, 'name' | 'type' | 'description' | 'tags' | 'pw' | 'surface' | 'screenshot'>>;
}

export interface AnalyzeObjectResult {
  projectPath: string;
  object?: UnifiedObject;
  proposed?: UnifiedObject;
  written: boolean;
}

export interface GherkinOptions {
  projectPath: string;
  text?: string;
  filePath?: string;
  scenarioName?: string;
  write?: boolean;
}

export interface GherkinResult {
  projectPath: string;
  featurePath: string;
  feature: string;
  written: boolean;
}

type ScenarioStep = IStep & { children?: ScenarioStep[] };

/**
 * Deterministic automation agents used by both Copilot Chat and tests.
 *
 * The service deliberately separates preview from writes. The VS Code tool
 * wrapper asks for confirmation before passing write=true.
 */
export class AutomationStudioAgentService {
  public async buildObjectRepository(options: BuildObjectRepositoryOptions): Promise<ObjectRepositoryBuildResult> {
    const projectPath = path.resolve(options.projectPath);
    const scenarioFiles = await this.findScenarioFiles(projectPath, options.scenarioPath);
    const mode = options.mode || 'all';
    const collected = new Map<string, UnifiedObject>();
    const skipped: string[] = [];

    for (const scenarioFile of scenarioFiles) {
      let scenario: IScenario;
      try {
        scenario = JSON.parse(await fs.readFile(scenarioFile, 'utf8')) as IScenario;
      } catch {
        skipped.push(path.relative(projectPath, scenarioFile));
        continue;
      }
      for (const step of this.flattenSteps(scenario.steps || [])) {
        const object = this.objectFromStep(step, scenario.mode === 'surface' ? 'surface' : 'pw');
        if (!object) continue;
        if (mode === 'pw' && !object.pw) continue;
        if (mode === 'surface' && !object.surface?.length) continue;

        const existing = collected.get(object.id);
        collected.set(object.id, existing ? this.mergeObjects(existing, object) : object);
      }
    }

    const objects = [...collected.values()].sort((a, b) => a.id.localeCompare(b.id));
    const repository = new UnifiedFileSystemObjectRepository(projectPath);
    const created: string[] = [];
    const updated: string[] = [];
    if (options.write) {
      for (const object of objects) {
        const previous = await repository.getObject(`object://${object.id}`);
        await repository.save(object, 'Automation Studio Object Repository Agent', previous ? 'Merged locators from scenarios' : 'Built from scenarios');
        (previous ? updated : created).push(object.id);
      }
    }

    return { projectPath, scenarioFiles: scenarioFiles.map((file) => path.relative(projectPath, file)), objects, created, updated, skipped, writeRequested: Boolean(options.write) };
  }

  public async analyzeObject(options: AnalyzeObjectOptions): Promise<AnalyzeObjectResult> {
    const projectPath = path.resolve(options.projectPath);
    const repository = new UnifiedFileSystemObjectRepository(projectPath);
    const uri = options.objectId.startsWith('object://') ? options.objectId : `object://${options.objectId}`;
    const object = await repository.getObject(uri);
    if (!object) return { projectPath, written: false };
    const proposed = options.correction ? { ...object, ...options.correction } : object;
    if (options.write && options.correction) {
      await repository.save(proposed, 'Automation Studio Object Analyzer', 'Manual correction from Copilot Chat');
      return { projectPath, object, proposed, written: true };
    }
    return { projectPath, object, proposed, written: false };
  }

  public async generateGherkin(options: GherkinOptions): Promise<GherkinResult> {
    const projectPath = path.resolve(options.projectPath);
    const source = options.text?.trim() || (options.filePath ? await this.readInputFile(projectPath, options.filePath) : '');
    if (!source.trim()) throw new Error('Provide test-case text or a file path to generate Gherkin.');
    const featureName = this.titleCase(options.scenarioName || this.firstMeaningfulLine(source) || 'Automation workflow');
    const feature = this.toFeature(featureName, source);
    const featurePath = path.join('automation', 'scenarios', `${this.slug(featureName)}.feature`);
    if (options.write) {
      await fs.mkdir(path.dirname(path.join(projectPath, featurePath)), { recursive: true });
      await fs.writeFile(path.join(projectPath, featurePath), feature, 'utf8');
    }
    return { projectPath, featurePath, feature, written: Boolean(options.write) };
  }

  private async findScenarioFiles(projectPath: string, scenarioPath?: string): Promise<string[]> {
    if (scenarioPath) {
      const resolved = this.safeProjectPath(projectPath, scenarioPath);
      return resolved.endsWith('.json') ? [resolved] : this.findScenarioFilesInDirectory(resolved);
    }
    return this.findScenarioFilesInDirectory(path.join(projectPath, 'automation', 'scenarios'));
  }

  private async findScenarioFilesInDirectory(directory: string): Promise<string[]> {
    try {
      const entries = await fs.readdir(directory, { withFileTypes: true });
      const files: string[] = [];
      for (const entry of entries) {
        const resolved = path.join(directory, entry.name);
        if (entry.isDirectory()) files.push(...await this.findScenarioFilesInDirectory(resolved));
        else if (entry.isFile() && entry.name.endsWith('.scenario.json')) files.push(resolved);
      }
      return files.sort();
    } catch {
      return [];
    }
  }

  private safeProjectPath(projectPath: string, candidate: string): string {
    const resolved = path.resolve(projectPath, candidate);
    if (resolved !== projectPath && !resolved.startsWith(`${projectPath}${path.sep}`)) throw new Error('Path must stay inside the Automation Studio project.');
    return resolved;
  }

  private async readInputFile(projectPath: string, filePath: string): Promise<string> {
    return fs.readFile(this.safeProjectPath(projectPath, filePath), 'utf8');
  }

  private flattenSteps(steps: ScenarioStep[]): ScenarioStep[] {
    return steps.flatMap((step) => [step, ...this.flattenSteps(step.children || [])]);
  }

  private objectFromStep(step: ScenarioStep, scenarioMode: 'pw' | 'surface'): UnifiedObject | undefined {
    const target = typeof step.target === 'string' ? step.target.trim() : '';
    const surface = step.surface?.locators?.filter(Boolean) as SurfaceLocatorEvidence[] | undefined;
    const pwTarget = scenarioMode === 'pw' ? target : '';
    if (!target || this.isNonElementTarget(step.type, target)) return undefined;
    const name = this.elementName(step.description, target);
    const id = `app.${this.slug(name)}`;
    const type = this.objectType(step, name);
    const object: UnifiedObject = {
      id, name, type, version: 1, createdAt: 0, updatedAt: 0,
      description: step.description,
      pw: pwTarget ? this.playwrightLocator(pwTarget, name) : undefined,
      surface: surface?.length ? surface : undefined,
      screenshot: this.firstScreenshot(step.screenshots),
      captureMetadata: step.surface?.captureMetadata,
    };
    return object;
  }

  private mergeObjects(left: UnifiedObject, right: UnifiedObject): UnifiedObject {
    return {
      ...left,
      name: left.name || right.name,
      description: left.description || right.description,
      pw: left.pw || right.pw,
      surface: this.mergeSurface(left.surface, right.surface),
      screenshot: left.screenshot || right.screenshot,
      captureMetadata: left.captureMetadata || right.captureMetadata,
    };
  }

  private mergeSurface(left?: SurfaceLocatorEvidence[], right?: SurfaceLocatorEvidence[]): SurfaceLocatorEvidence[] | undefined {
    const values = [...(left || []), ...(right || [])];
    const unique = values.filter((value, index) => values.findIndex((candidate) => candidate.strategy === value.strategy && JSON.stringify(candidate.value) === JSON.stringify(value.value)) === index);
    return unique.length ? unique : undefined;
  }

  private firstScreenshot(screenshots?: IScreenshotAttachment[]): UnifiedObject['screenshot'] | undefined {
    const screenshot = screenshots?.find((item) => item.path || item.dataUrl);
    return screenshot ? { name: screenshot.name, path: screenshot.path, dataUrl: screenshot.dataUrl } : undefined;
  }

  private isNonElementTarget(type: string, target: string): boolean {
    return type === 'navigate' || type === 'launch' || type === 'waitNavigation' || /^https?:\/\//i.test(target) || /^(body|html|h[1-6])$/i.test(target);
  }

  private objectType(step: ScenarioStep, name: string): UnifiedObjectType {
    const text = `${step.type} ${step.description || ''} ${name}`.toLowerCase();
    if (step.type === 'select' || /dropdown|select option/.test(text)) return 'dropdown';
    if (/checkbox|check box/.test(text)) return 'checkbox';
    if (/radio/.test(text)) return 'radioButton';
    if (/link|hyperlink/.test(text)) return 'link';
    if (step.type === 'type' || /textbox|text box|input|password|username/.test(text)) return 'textbox';
    if (step.type === 'click' || /button|submit|login/.test(text)) return 'button';
    if (step.type.startsWith('assert')) return 'label';
    return 'custom';
  }

  private playwrightLocator(target: string, name: string): UnifiedObject['pw'] {
    if (/^getByRole\(/.test(target)) return { css: target };
    if (/^getBy(TestId|Label|Placeholder|Text)\(/.test(target)) return { css: target };
    return { css: target, name };
  }

  private elementName(description: string | undefined, target: string): string {
    const descriptive = (description || '').replace(/^(open|verify|fill|type|click|select|check|uncheck|assert|wait for|navigate to|launch)\s+/i, '').replace(/\s+(text ?box|button|control|option)$/i, '').trim();
    if (descriptive && !/^step\b/i.test(descriptive)) return this.titleCase(descriptive);
    const selectorName = target.replace(/^.*[#.]([A-Za-z][\w-]*)$/, '$1').replace(/[^A-Za-z0-9]+/g, ' ').trim();
    return this.titleCase(selectorName || 'Unnamed control');
  }

  private toFeature(featureName: string, source: string): string {
    const lines = source.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const explicit = lines.filter((line) => /^(feature|background|scenario|given|when|then|and|but):/i.test(line));
    if (explicit.length) {
      const normalized = explicit.map((line) => {
        const match = line.match(/^(feature|background|scenario|given|when|then|and|but):\s*(.*)$/i);
        return match ? `${this.titleCase(match[1] || '')}: ${match[2] || ''}` : line;
      });
      if (!normalized.some((line) => /^Feature:/i.test(line))) normalized.unshift(`Feature: ${featureName}`);
      if (!normalized.some((line) => /^Scenario:/i.test(line))) normalized.splice(1, 0, `  Scenario: ${featureName}`);
      return `${normalized.map((line) => /^Feature:/i.test(line) ? line : /^Scenario:|^Background:/i.test(line) ? `  ${line}` : `    ${line}`).join('\n')}\n`;
    }

    const scenarios = this.splitCases(lines);
    const output = [`Feature: ${featureName}`, '', `  Scenario: ${featureName}`];
    for (const line of scenarios[0] || []) output.push(`    ${this.toStep(line)}`);
    for (let index = 1; index < scenarios.length; index += 1) {
      output.push('', `  Scenario: ${featureName} ${index + 1}`);
      for (const line of scenarios[index] || []) output.push(`    ${this.toStep(line)}`);
    }
    return `${output.join('\n')}\n`;
  }

  private splitCases(lines: string[]): string[][] {
    const cases: string[][] = [[]];
    for (const line of lines) {
      if (/^(test case|scenario|case)\b/i.test(line) || /^\d+[.)]\s/.test(line)) {
        if (cases.at(-1)?.length) cases.push([]);
        continue;
      }
      cases.at(-1)!.push(line.replace(/^[-*•]\s*/, '').replace(/^\d+[.)]\s*/, ''));
    }
    return cases.filter((items) => items.length);
  }

  private toStep(line: string): string {
    if (/^(given|when|then|and|but)\b/i.test(line)) return this.titleCase(line);
    if (/verify|assert|check|should|expected|visible|success|error|matches/i.test(line)) return `Then ${line}`;
    if (/click|press|type|fill|enter|select|upload|submit|navigate|open|go to|launch|scroll|hover/i.test(line)) return `When ${line}`;
    return `Given ${line}`;
  }

  private firstMeaningfulLine(source: string): string {
    return source.split(/\r?\n/).map((line) => line.trim()).find((line) => line && !/^(feature|scenario|test case|case):?/i.test(line)) || '';
  }

  private titleCase(value: string): string {
    return value.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/\b\w/g, (character) => character.toUpperCase());
  }

  private slug(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.|\.$/g, '').slice(0, 80) || 'control';
  }
}
