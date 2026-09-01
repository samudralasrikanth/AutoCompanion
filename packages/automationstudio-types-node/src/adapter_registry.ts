import { ActionDefinition } from './generated/execution';
import { AdapterContract } from './generated/adapter';

export class AdapterConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AdapterConflictError';
  }
}

export class AdapterNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AdapterNotFoundError';
  }
}

export class AdapterRegistry {
  private readonly adapters: AdapterContract[] = [];

  register(adapter: AdapterContract): void {
    this.adapters.push(adapter);
  }

  selectAdapter(action: ActionDefinition): AdapterContract {
    const candidates = this.adapters.filter(adapter => 
      adapter.supportedActionTypes.includes(action.type)
    );

    if (candidates.length === 0) {
      throw new AdapterNotFoundError(`No adapter found for action type '${action.type}'`);
    }

    const maxPriority = Math.max(...candidates.map(a => a.priority));
    const topCandidates = candidates.filter(a => a.priority === maxPriority);

    if (topCandidates.length > 1) {
      const ids = topCandidates.map(a => a.id).join(', ');
      throw new AdapterConflictError(
        `Multiple adapters with priority ${maxPriority} matched action '${action.type}': [${ids}]. ` +
        `Adapter selection must be deterministic.`
      );
    }

    const selected = topCandidates[0];
    if (!selected) {
      // Keep the contract total even if the selection logic changes later.
      throw new AdapterNotFoundError(`No adapter found for action type '${action.type}'`);
    }

    return selected;
  }
}
