import { LocatorStrategy } from './locator_strategy';

export class LocatorStrategyRegistry {
  private strategies = new Map<string, LocatorStrategy>();

  constructor(defaultStrategies: LocatorStrategy[] = []) {
    for (const strategy of defaultStrategies) {
      this.register(strategy);
    }
  }

  register(strategy: LocatorStrategy): void {
    this.strategies.set(strategy.id, strategy);
  }

  get(id: string): LocatorStrategy | undefined {
    return this.strategies.get(id);
  }

  getPriority(id: string): number {
    return this.strategies.get(id)?.priority ?? 1000; // Default low priority if unknown
  }

  clear(): void {
    this.strategies.clear();
  }
}
