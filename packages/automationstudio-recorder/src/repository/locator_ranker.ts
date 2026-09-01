import { LocatorCandidate } from '@automation-studio/types';
import { LocatorStrategyRegistry } from './locator_strategy_registry';

const STABILITY_WEIGHTS: Record<string, number> = {
  high: 3,
  medium: 2,
  low: 1,
  unknown: 0
};

export class LocatorRanker {
  constructor(private registry: LocatorStrategyRegistry) {}

  rank(candidates: LocatorCandidate[]): LocatorCandidate[] {
    return [...candidates].sort((a, b) => {
      // 1. Score DESC
      if (a.score !== b.score) {
        return b.score - a.score;
      }

      // 2. Stability DESC
      const stabilityA = STABILITY_WEIGHTS[a.stability] ?? -1;
      const stabilityB = STABILITY_WEIGHTS[b.stability] ?? -1;
      if (stabilityA !== stabilityB) {
        return stabilityB - stabilityA;
      }

      // 3. Strategy Priority ASC (from registry, lower is better priority)
      // Note: we can either use candidate.priority if set, or fall back to registry.
      const priorityA = a.priority ?? this.registry.getPriority(a.strategy);
      const priorityB = b.priority ?? this.registry.getPriority(b.strategy);
      if (priorityA !== priorityB) {
        return priorityA - priorityB;
      }

      // 4. Candidate ID ASC
      return a.id.localeCompare(b.id);
    });
  }
}
