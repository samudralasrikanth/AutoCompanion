import { SharedMemory } from './shared-memory';
import { SecretManager } from './secrets';

export interface IContext {
  readonly id: string;
  readonly name: string;
  readonly memory: SharedMemory;
  readonly secrets: SecretManager;
}

export abstract class BaseContext implements IContext {
  public readonly id: string;
  public readonly name: string;
  public readonly memory: SharedMemory;
  public readonly secrets: SecretManager;

  constructor(id: string, name: string, memory: SharedMemory, secrets: SecretManager) {
    this.id = id;
    this.name = name;
    this.memory = memory;
    this.secrets = secrets;
  }
}

export class GlobalContext extends BaseContext {
  constructor(id: string, name: string) {
    super(id, name, new SharedMemory(), new SecretManager());
  }
}

export class SuiteContext extends BaseContext {
  constructor(id: string, name: string, public readonly parent: GlobalContext) {
    super(id, name, new SharedMemory(parent.memory), parent.secrets);
  }
}

export class ScenarioContext extends BaseContext {
  constructor(id: string, name: string, public readonly parent: SuiteContext) {
    super(id, name, new SharedMemory(parent.memory), parent.secrets);
  }
}

export class StepContext extends BaseContext {
  constructor(id: string, name: string, public readonly parent: ScenarioContext) {
    super(id, name, new SharedMemory(parent.memory), parent.secrets);
  }
}
