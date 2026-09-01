import { IRNode, ActionNode } from '../ir/ir_nodes';
import { LocatorTranslator } from './locator_translator';

export type ActionTranslationHandler = (action: any, repository: any) => IRNode | null;

export class ActionTranslatorRegistry {
  private handlers = new Map<string, ActionTranslationHandler>();

  register(type: string, handler: ActionTranslationHandler) {
    this.handlers.set(type, handler);
  }

  translate(action: any, repository: any): IRNode | null {
    const handler = this.handlers.get(action.type);
    if (!handler) {
      return null; // Signals UNSUPPORTED_ACTION
    }
    return handler(action, repository);
  }
}

// Default registry with base actions
export const defaultActionRegistry = new ActionTranslatorRegistry();

const createStandardActionNode = (operation: string, action: any, repository: any): ActionNode => {
  const node: ActionNode = {
    kind: 'ActionNode',
    operation,
    traceability: {
      actionId: action.id,
      sourceEventId: action.metadata?.sourceEventId
    }
  };

  if (action.target?.objectId) {
    const repoObj = repository[action.target.objectId];
    node.target = LocatorTranslator.translate(repoObj);
    if (node.traceability) {
      node.traceability.repositoryObjectId = action.target.objectId;
    }
  }

  // Execution policies
  if (action.executionPolicy) {
    node.timeout = action.executionPolicy.timeoutMs;
    node.retryPolicy = action.executionPolicy.retry ? { maxRetries: action.executionPolicy.retry } : undefined;
    node.failurePolicy = action.executionPolicy.continueOnFailure ? 'ignore' : 'abort';
  }

  return node;
};

defaultActionRegistry.register('click', (action, repository) => {
  return createStandardActionNode('CLICK', action, repository);
});

defaultActionRegistry.register('type', (action, repository) => {
  const node = createStandardActionNode('TYPE', action, repository);
  node.arguments = { text: action.data?.text || '' };
  return node;
});

defaultActionRegistry.register('keypress', (action, repository) => {
  const node = createStandardActionNode('KEYPRESS', action, repository);
  node.arguments = { key: action.data?.key || '' };
  return node;
});

defaultActionRegistry.register('select', (action, repository) => {
  const node = createStandardActionNode('SELECT', action, repository);
  node.arguments = { value: action.data?.value || '' };
  return node;
});

defaultActionRegistry.register('hover', (action, repository) => {
  return createStandardActionNode('HOVER', action, repository);
});

defaultActionRegistry.register('navigate', (action, repository) => {
  return {
    kind: 'NavigationNode',
    url: action.data?.url || '',
    traceability: {
      actionId: action.id,
      sourceEventId: action.metadata?.sourceEventId
    }
  };
});

defaultActionRegistry.register('wait', (action, repository) => {
  return {
    kind: 'WaitNode',
    durationMs: action.data?.durationMs,
    traceability: {
      actionId: action.id,
      sourceEventId: action.metadata?.sourceEventId
    }
  };
});

defaultActionRegistry.register('screenshot', (action, repository) => {
  const node = createStandardActionNode('SCREENSHOT', action, repository);
  node.arguments = { fullPage: action.data?.fullPage };
  return node;
});
