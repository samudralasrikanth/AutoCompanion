import { AssertionNode } from '../ir/ir_nodes';
import { LocatorTranslator } from './locator_translator';

export class AssertionTranslator {
  static translate(action: any, repository: any): AssertionNode | null {
    if (action.type !== 'assert') return null;

    const node: AssertionNode = {
      kind: 'AssertionNode',
      assertionType: action.data?.assertionType || 'visible',
      expectedValue: action.data?.expectedValue,
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

    if (action.executionPolicy?.timeoutMs) {
      node.timeout = action.executionPolicy.timeoutMs;
    }

    return node;
  }
}
