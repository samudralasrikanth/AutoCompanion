import type { SemanticAction } from '@automation-studio/recorder';

const DOUBLE_CLICK_MAX_GAP_MS = 500;

export class ScenarioNormalizer {
  public normalize(actions: SemanticAction[]): SemanticAction[] {
    const merged = this.mergeDoubleClicks(actions);
    return this.collapseWaits(merged);
  }

  private mergeDoubleClicks(actions: SemanticAction[]): SemanticAction[] {
    const result: SemanticAction[] = [];
    let i = 0;

    while (i < actions.length) {
      const current = actions[i];
      const next = actions[i + 1];

      if (
        current &&
        next &&
        current.action === 'click' &&
        next.action === 'click' &&
        current.target === next.target &&
        next.timestamp - current.timestamp <= DOUBLE_CLICK_MAX_GAP_MS
      ) {
        result.push({
          ...current,
          id: current.id,
          action: 'doubleClick',
          timestamp: next.timestamp,
        });
        i += 2;
        continue;
      }

      if (current) {
        result.push(current);
      }
      i += 1;
    }

    return result;
  }

  private collapseWaits(actions: SemanticAction[]): SemanticAction[] {
    const result: SemanticAction[] = [];
    let i = 0;

    while (i < actions.length) {
      const current = actions[i];
      if (!current) {
        i += 1;
        continue;
      }

      if (current.action !== 'wait') {
        result.push(current);
        i += 1;
        continue;
      }

      let totalTimeout = Number(current.parameters['timeout'] ?? 0);
      let last = current;
      i += 1;

      while (i < actions.length && actions[i]?.action === 'wait') {
        const waitAction = actions[i]!;
        totalTimeout += Number(waitAction.parameters['timeout'] ?? 0);
        last = waitAction;
        i += 1;
      }

      result.push({
        ...last,
        parameters: { ...last.parameters, timeout: totalTimeout },
      });
    }

    return result;
  }
}
