import type { IScenario } from '../scenario/scenario-ir';

export interface IScenarioRepository {
  saveScenario(scenario: IScenario): Promise<void>;
  getScenario(id: string): Promise<IScenario | undefined>;
  getAllScenarios(): Promise<IScenario[]>;
  deleteScenario(id: string): Promise<void>;
}
