import type { IScenario, IStep } from './scenario-ir';
import type { ValidationWarning } from './scenario-validator';

export class ScenarioLinter {
  public lint(scenario: IScenario): ValidationWarning[] {
    const warnings: ValidationWarning[] = [];
    
    // Rule: Scenario too long
    if (scenario.steps.length > 200) {
      warnings.push({
        severity: 'warning',
        message: 'Scenario is too long (> 200 logical steps).',
        recommendation: 'Consider breaking this scenario into smaller, reusable scenarios.'
      });
    }

    // Rule: Duplicate object names
    const targetMap = new Set<string>();
    let hasDuplicateTargets = false;
    scenario.steps.forEach(step => {
      if (step.target) {
        if (targetMap.has(step.target)) {
          hasDuplicateTargets = true;
        }
        targetMap.add(step.target);
      }
    });
    // This is just a heuristic, as reusing targets is fine, but in some contexts we lint for redundant operations.

    // Rule: Unused variables
    if (scenario.variables) {
      for (const v of scenario.variables) {
        let isUsed = false;
        const allSteps = [
          ...(scenario.preconditions || []),
          ...(scenario.steps || []),
          ...(scenario.assertions || []),
          ...(scenario.recovery || []),
          ...(scenario.cleanup || [])
        ];
        
        for (const step of allSteps) {
          if (step.parameters?.some(p => p.isVariable && p.value === v.name)) {
            isUsed = true;
            break;
          }
        }

        if (!isUsed) {
          warnings.push({
            severity: 'info',
            message: `Variable '${v.name}' is declared but never used.`,
            recommendation: 'Remove the unused variable to keep the scenario clean.'
          });
        }
      }
    }

    // Rule: Dead recovery blocks
    if (scenario.recovery && scenario.recovery.length > 0) {
      if (scenario.steps.length === 0) {
        warnings.push({
          severity: 'info',
          message: 'Recovery block exists but main flow is empty.',
          recommendation: 'Remove the dead recovery block or add main flow steps.'
        });
      }
    }

    return warnings;
  }
}
