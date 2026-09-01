import type { IScenario, IStep } from './scenario-ir';

export type ValidationSeverity = 'error' | 'warning' | 'info';

export interface ValidationWarning {
  stepId?: string;
  severity: ValidationSeverity;
  message: string;
  recommendation?: string;
}

export class ScenarioValidator {
  public validate(scenario: IScenario): ValidationWarning[] {
    const warnings: ValidationWarning[] = [];
    
    // Rule: Missing Waits (navigate without wait)
    // Rule: Locator Confidence
    // Rule: Unassigned Variables

    scenario.steps.forEach((step, index) => {
      // Locator Confidence Check
      if (step.locatorFallback && step.locatorFallback.length > 0) {
        const primary = step.locatorFallback[0];
        if (primary && (primary.strategy === 'xpath' || primary.strategy === 'css')) {
          warnings.push({
            stepId: step.id,
            severity: 'warning',
            message: `Locator confidence is low (using ${primary.strategy})`,
            recommendation: 'Capture again using a data-testid or role if possible.'
          });
        }
      }

      // Missing wait condition after navigation
      if (step.type === 'navigate') {
        const nextStep = scenario.steps[index + 1];
        if (!nextStep || (nextStep.type !== 'waitNavigation' && !nextStep.type.startsWith('assert'))) {
          warnings.push({
            stepId: step.id,
            severity: 'warning',
            message: 'Navigate action with no wait condition following it.',
            recommendation: 'Add an assertion or wait step after navigation.'
          });
        }
      }

      // Check for unassigned variables in parameters
      if (step.parameters) {
        for (const param of step.parameters) {
          if (param.isVariable) {
            const varExists = scenario.variables?.some(v => v.name === param.value);
            if (!varExists) {
              warnings.push({
                stepId: step.id,
                severity: 'error',
                message: `Variable '${param.value}' is never assigned or defined in scenario variables.`,
                recommendation: 'Define the variable in the scenario variables section.'
              });
            }
          }
        }
      }
    });

    return warnings;
  }
}
