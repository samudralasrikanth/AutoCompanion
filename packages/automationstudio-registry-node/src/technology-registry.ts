import type { BaseFramework } from '@automation-studio/sdk';

export interface ITechnologyAdapter {
  id: string;
  name: string;
  version: string;
  capabilities: string[];
  createFramework(): BaseFramework;
}

export class TechnologyRegistry {
  private adapters = new Map<string, ITechnologyAdapter>();

  public register(adapter: ITechnologyAdapter): void {
    if (this.adapters.has(adapter.id)) {
      throw new Error(`Adapter with id ${adapter.id} is already registered.`);
    }
    this.adapters.set(adapter.id, adapter);
  }

  public getAdapter(id: string): ITechnologyAdapter | undefined {
    return this.adapters.get(id);
  }

  public getAllAdapters(): ITechnologyAdapter[] {
    return Array.from(this.adapters.values());
  }

  public resolveByCapability(capability: string): ITechnologyAdapter[] {
    return this.getAllAdapters().filter(adapter => adapter.capabilities.includes(capability));
  }
}
