import type { IStep, IScenario } from '@automation-studio/sdk';
import type { RecordSession } from '@automation-studio/recorder';
import { randomUUID } from 'crypto';

export class ScenarioBuilder {
  public build(session: RecordSession, steps: IStep[]): IScenario {
    const mode = session.technology === 'web' || session.technology === 'playwright'
      ? 'playwright'
      : session.technology === 'vision' || session.technology === 'desktop' || session.technology === 'citrix'
        ? 'surface'
        : undefined;
    return {
      id: session.id || randomUUID(),
      name: session.name || `Recorded Scenario - ${session.technology}`,
      description: `Generated from recording session ${session.id}`,
      mode,
      steps: steps,
      metadata: {
        schemaVersion: '1.0',
        createdBy: 'Automation Studio',
        generatedBy: session.technology,
        platformVersion: '0.1.0'
      },
      createdAt: session.startedAt,
      updatedAt: Date.now()
    };
  }
}
