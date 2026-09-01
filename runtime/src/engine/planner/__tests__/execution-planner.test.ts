import { describe, expect, it } from 'vitest';
import { ExecutionPlanner } from '../execution-planner';
import type { IScenario, IStep } from '@automation-studio/sdk';

const step = (id: string): IStep => ({ id, type: 'click' });

const scenario = (overrides: Partial<IScenario> = {}): IScenario => ({
  id: 'scenario-1',
  name: 'Planner test',
  steps: [step('main')],
  createdAt: 0,
  updatedAt: 0,
  ...overrides,
});

describe('ExecutionPlanner', () => {
  it('routes main-step failures through recovery and then cleanup', () => {
    const plan = new ExecutionPlanner().plan(scenario({
      recovery: [step('recover')],
      cleanup: [step('cleanup')],
    }));

    expect(plan.graph.edges).toEqual(expect.arrayContaining([
      { source: 'node_main', target: 'node_recover', condition: 'failure' },
      { source: 'node_recover', target: 'node_cleanup', condition: 'always' },
    ]));
    expect(plan.graph.edges).not.toContainEqual({
      source: 'node_cleanup',
      target: 'node_recover',
      condition: 'success',
    });
  });

  it('does not route preconditions, assertions, or cleanup failures to recovery', () => {
    const plan = new ExecutionPlanner().plan(scenario({
      preconditions: [step('precondition')],
      assertions: [step('assertion')],
      cleanup: [step('cleanup')],
      recovery: [step('recover')],
    }));

    const recoveryEdges = plan.graph.edges.filter(edge => edge.target === 'node_recover');
    expect(recoveryEdges).toEqual([
      { source: 'node_main', target: 'node_recover', condition: 'failure' },
    ]);
  });
});
