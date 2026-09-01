import type { IScenario } from '@automation-studio/sdk';
import type { IScenarioRepository } from '@automation-studio/sdk';

export class ScenarioSerializer {
  private repository: IScenarioRepository;

  constructor(repository: IScenarioRepository) {
    this.repository = repository;
  }

  public async serialize(scenario: IScenario): Promise<void> {
    await this.repository.saveScenario(scenario);
  }
}
