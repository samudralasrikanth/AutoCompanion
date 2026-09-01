import type { IScenario, IStep } from './scenario-ir';

export interface StepDiff {
  stepId: string;
  type: 'added' | 'removed' | 'changed';
  description: string;
}

export class ScenarioDiff {
  public compute(oldScenario: IScenario, newScenario: IScenario): StepDiff[] {
    const diffs: StepDiff[] = [];
    
    const oldSteps = new Map<string, IStep>();
    const newSteps = new Map<string, IStep>();

    const flatten = (s: IScenario) => [
      ...(s.preconditions || []),
      ...(s.steps || []),
      ...(s.assertions || []),
      ...(s.recovery || []),
      ...(s.cleanup || [])
    ];

    flatten(oldScenario).forEach(s => oldSteps.set(s.id, s));
    flatten(newScenario).forEach(s => newSteps.set(s.id, s));

    // Check for added/changed
    for (const [id, newStep] of newSteps) {
      if (!oldSteps.has(id)) {
        diffs.push({
          stepId: id,
          type: 'added',
          description: `Added: ${this.formatStep(newStep)}`
        });
      } else {
        const oldStep = oldSteps.get(id)!;
        if (this.formatStep(oldStep) !== this.formatStep(newStep)) {
          diffs.push({
            stepId: id,
            type: 'changed',
            description: `Changed: ${this.formatStep(oldStep)} ➔ ${this.formatStep(newStep)}`
          });
        }
      }
    }

    // Check for removed
    for (const [id, oldStep] of oldSteps) {
      if (!newSteps.has(id)) {
        diffs.push({
          stepId: id,
          type: 'removed',
          description: `Removed: ${this.formatStep(oldStep)}`
        });
      }
    }

    return diffs;
  }

  private formatStep(step: IStep): string {
    const target = step.target ? ` '${step.target}'` : '';
    const params = step.parameters ? ` (${step.parameters.map(p => p.value).join(', ')})` : '';
    return `${step.type}${target}${params}`;
  }
}
