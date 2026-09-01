import * as fs from 'fs';
import * as path from 'path';
import type { IScenario } from '../scenario/scenario-ir';
import type { IScenarioRepository } from './scenario-repository';

export class LocalScenarioRepository implements IScenarioRepository {
  private readonly rootPath: string;
  private readonly scenariosDir: string;

  constructor(rootPath: string) {
    this.rootPath = rootPath;
    this.scenariosDir = path.join(this.rootPath, 'scenarios');
    if (!fs.existsSync(this.scenariosDir)) {
      fs.mkdirSync(this.scenariosDir, { recursive: true });
    }
  }

  public async saveScenario(scenario: IScenario): Promise<void> {
    const filePath = path.join(this.scenariosDir, `${scenario.id}.scenario.json`);
    await fs.promises.writeFile(filePath, JSON.stringify(scenario, null, 2), 'utf8');
  }

  public async getScenario(id: string): Promise<IScenario | undefined> {
    const filePath = path.join(this.scenariosDir, `${id}.scenario.json`);
    if (!fs.existsSync(filePath)) return undefined;
    const content = await fs.promises.readFile(filePath, 'utf8');
    return JSON.parse(content) as IScenario;
  }

  public async getAllScenarios(): Promise<IScenario[]> {
    if (!fs.existsSync(this.scenariosDir)) return [];
    const files = await fs.promises.readdir(this.scenariosDir);
    const scenarios: IScenario[] = [];
    for (const file of files) {
      if (file.endsWith('.scenario.json')) {
        const content = await fs.promises.readFile(path.join(this.scenariosDir, file), 'utf8');
        scenarios.push(JSON.parse(content) as IScenario);
      }
    }
    return scenarios;
  }

  public async deleteScenario(id: string): Promise<void> {
    const filePath = path.join(this.scenariosDir, `${id}.scenario.json`);
    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath);
    }
  }
}
