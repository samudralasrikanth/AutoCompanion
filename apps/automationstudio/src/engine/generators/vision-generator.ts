import type { IScenario, IStep, SurfaceLocatorEvidence } from '@automation-studio/sdk';
import type { IVisualObject } from '@automation-studio/sdk/src/repository/object-repository';
import { pyStr } from './generator-utils';

const IMAGE_EXTENSIONS = /\.(png|jpg|jpeg|bmp|gif)$/i;
const STRATEGY_PRIORITY: Record<string, number> = {
  uia: 10,
  accessibility: 20,
  native: 30,
  ocr: 40,
  image: 50,
  anchor: 60,
  relative: 70,
  coordinate: 80,
};

/** Generates declarative Surface workflow data backed by the SDK runtime. */
export class SurfaceGenerator {
  private static locator(
    strategy: string,
    value: string,
    extra: Partial<SurfaceLocatorEvidence> = {},
  ): SurfaceLocatorEvidence {
    return { strategy: strategy as SurfaceLocatorEvidence['strategy'], value, ...extra };
  }

  private static getSurfaceLocators(step: IStep, obj?: IVisualObject): SurfaceLocatorEvidence[] {
    const definition = obj?.definition;
    const locators: SurfaceLocatorEvidence[] = [];

    for (const locator of step.surface?.locators || []) {
      locators.push(this.locator(locator.strategy, locator.value as string, locator));
    }
    for (const locator of definition?.locators || []) {
      const { strategy: _strategy, ...evidence } = locator;
      locators.push(this.locator(locator.strategy, locator.value, evidence));
    }
    if (definition?.automationId) locators.push(this.locator('uia', definition.automationId));
    if (definition?.aria) locators.push(this.locator('accessibility', definition.aria));
    if (definition?.ocr?.text) locators.push(this.locator('ocr', definition.ocr.text));
    else if (definition?.text) locators.push(this.locator('ocr', definition.text));
    if (definition?.image?.path) locators.push(this.locator('image', definition.image.path));
    if (definition?.anchor?.objectId) locators.push(this.locator('anchor', definition.anchor.objectId));
    if (definition?.css) locators.push(this.locator('native', definition.css));
    else if (definition?.xpath) locators.push(this.locator('native', definition.xpath));
    for (const fallback of step.locatorFallback || []) {
      locators.push(this.locator(fallback.strategy, fallback.value));
    }
    if (locators.length === 0 && step.target) {
      locators.push(this.locator(IMAGE_EXTENSIONS.test(step.target) ? 'image' : 'ocr', step.target));
    }

    return locators
      .map((locator, index) => ({ locator, index }))
      .sort((a, b) => (
        (a.locator.priority ?? STRATEGY_PRIORITY[a.locator.strategy] ?? 999) -
        (b.locator.priority ?? STRATEGY_PRIORITY[b.locator.strategy] ?? 999) ||
        a.index - b.index
      ))
      .map(item => item.locator);
  }

  private static pythonValue(value: unknown): string {
    if (value === null || value === undefined) return 'None';
    if (typeof value === 'string') return pyStr(value);
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    if (Array.isArray(value)) return '[' + value.map(item => this.pythonValue(item)).join(', ') + ']';
    if (typeof value === 'object') {
      return '{' + Object.entries(value as Record<string, unknown>)
        .map(([key, item]) => pyStr(key) + ': ' + this.pythonValue(item))
        .join(', ') + '}';
    }
    return pyStr(String(value));
  }

  private static generatedLocator(locator: SurfaceLocatorEvidence): string {
    const value = this.pythonValue(locator.value);
    const region = locator.region ? `, "region": ${this.pythonValue(locator.region)}` : '';
    const scope = locator.scope ? `, "scope": ${this.pythonValue(locator.scope)}` : '';
    switch (locator.strategy) {
      case 'image':
        return `{"type": "image", "template": ${value}${region}${scope}}`;
      case 'ocr':
        return `{"type": "ocr", "text": ${value}${region}${scope}}`;
      case 'coordinate':
        return `{"type": "coordinate", "value": ${value}${region}${scope}}`;
      default:
        return `{"type": "native", "selector": ${value}, "selector_type": ${pyStr(locator.strategy)}${region}${scope}}`;
    }
  }

  private static target(step: IStep, obj?: IVisualObject): string {
    const locators = this.getSurfaceLocators(step, obj);
    if (locators.length === 0) return 'None';
    if (locators.length === 1) return this.generatedLocator(locators[0]!);
    return `{"locators": [${locators.map(locator => {
      const value = this.pythonValue(locator.value);
      const region = locator.region ? `, "region": ${this.pythonValue(locator.region)}` : '';
      const scope = locator.scope ? `, "scope": ${this.pythonValue(locator.scope)}` : '';
      return `{"type": ${pyStr(locator.strategy)}, "value": ${value}${region}${scope}}`;
    }).join(', ')}]}`;
  }

  private static parameter(step: IStep, name: string): string {
    return step.parameters?.find(parameter => parameter.name === name)?.value || '';
  }

  private static surfaceOptions(step: IStep): string {
    const surface = step.surface;
    if (!surface) return '';
    const options: Record<string, unknown> = {};
    if (surface.windowTitle) options['window_title'] = surface.windowTitle;
    if (surface.screen) options['screen'] = surface.screen;
    if (surface.waitBefore) options['wait_before'] = surface.waitBefore;
    if (surface.waitAfter) options['wait_after'] = surface.waitAfter;
    if (surface.verification) options['verify_after'] = surface.verification;
    if (surface.recovery) options['recovery'] = surface.recovery;
    return Object.keys(options).length > 0 ? `, "surface": ${this.pythonValue(options)}` : '';
  }

  private static translateStep(step: IStep, objects?: Record<string, IVisualObject>): string | null {
    if (step.disabled) return null;
    const obj = step.target ? objects?.[step.target] : undefined;
    const target = this.target(step, obj);
    const surface = this.surfaceOptions(step);

    switch (step.type) {
      case 'click':
        return `{"click": {"target": ${target}${surface}}}`;
      case 'rightClick':
        return `{"click": {"target": ${target}, "button": "right"${surface}}}`;
      case 'doubleClick':
        return `{"click": {"target": ${target}, "button": "double"${surface}}}`;
      case 'hover':
        return `{"click": {"target": ${target}, "action": "hover"${surface}}}`;
      case 'type':
        return `{"type": {"target": ${target}, "text": ${pyStr(this.parameter(step, 'value'))}${surface}}}`;
      case 'dragAndDrop': {
        const destination = this.parameter(step, 'destination');
        const destinationLocator = this.locator(IMAGE_EXTENSIONS.test(destination) ? 'image' : 'ocr', destination);
        return `{"click": {"target": ${target}, "drag_to": ${this.generatedLocator(destinationLocator)}${surface}}}`;
      }
      case 'assertVisible':
        return `{"verify": {"target": ${target}, "state": "exists"${surface}}}`;
      case 'assertText':
        return `{"verify": {"target": ${target}, "state": "text", "expected": ${pyStr(this.parameter(step, 'text'))}${surface}}}`;
      case 'waitNavigation':
        return `{"wait_for_window": {"target": ${target}${surface}}}`;
      case 'navigate':
        return `{"launch": {"target": ${pyStr(this.parameter(step, 'url'))}${surface}}}`;
      default:
        return `# Unsupported step type: ${step.type}`;
    }
  }

  private static collectAllSteps(scenario: IScenario, objects?: Record<string, IVisualObject>): { section: string; entries: string[]; steps?: IStep[] }[] {
    const sections = [
      { section: 'preconditions', steps: scenario.preconditions },
      { section: 'steps', steps: scenario.steps },
      { section: 'assertions', steps: scenario.assertions },
      { section: 'cleanup', steps: scenario.cleanup },
    ];
    return sections
      .filter(section => section.steps && section.steps.length > 0)
      .map(section => ({
        section: section.section,
        steps: section.steps,
        entries: (section.steps || [])
          .map(step => this.translateStep(step, objects))
          .filter((entry): entry is string => entry !== null),
      }));
  }

  public static generatePython(scenario: IScenario, objects?: Record<string, IVisualObject>): string {
    const scenarioName = pyStr(scenario.name || 'Untitled Surface Scenario');
    const sections = this.collectAllSteps(scenario, objects);
    const entries: string[] = [];
    for (const section of sections) {
      if (section.entries.length === 0) continue;
      entries.push(`        # --- ${section.section} ---`);
      for (const entry of section.entries) entries.push(entry.startsWith('#') ? `        ${entry}` : `        ${entry},`);
    }
    const firstWindow = sections
      .flatMap(section => section.steps || [])
      .find(step => step.surface?.windowTitle)?.surface?.windowTitle;
    const maxRetries = scenario.recovery?.length ? 3 : 2;

    return [
      '"""Declarative Surface automation scenario."""',
      '# Runtime stages: WorkflowCompiler, ExecutionPipeline, StateValidationStage,',
      '# CommandTranslationStage, IdentificationStage, AdapterStage, VerificationStage,',
      '# RecoveryStage, and AuditStage are provided by the SDK.',
      'from automationstudio.sdk.surface import run_surface_workflow',
      '',
      'WORKFLOW = {',
      `    "workflow": {"name": ${scenarioName}, "version": "1.0"},`,
      `    "runtime": {"window_title": ${pyStr(firstWindow || '')}},`,
      '    "steps": [',
      ...entries,
      '    ],',
      '}',
      '',
      'def run():',
      `    result = run_surface_workflow(WORKFLOW, max_retries=${maxRetries})`,
      '    print(f"Execution: {result.status.value}")',
      '    for step in result.steps:',
      '        print(f"  {step.action_id}: {step.status.value} ({step.duration_ms:.0f}ms)")',
      '    return result.status.value == "completed"',
      '',
      'if __name__ == "__main__":',
      '    import sys',
      '    sys.exit(0 if run() else 1)',
      '',
    ].join('\n');
  }
}

/** Backward-compatible alias for existing Surface/Vision callers. */
export const VisionGenerator = SurfaceGenerator;
