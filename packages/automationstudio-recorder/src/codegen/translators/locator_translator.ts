import { LocatorReference } from '../ir/ir_nodes';

export class LocatorTranslator {
  static translate(repositoryObject: any): LocatorReference | undefined {
    if (!repositoryObject || !repositoryObject.preferredLocatorId) {
      return undefined;
    }

    const preferred = repositoryObject.locators?.find((l: any) => l.id === repositoryObject.preferredLocatorId);
    if (!preferred) {
      return undefined;
    }

    const fallbacks = repositoryObject.locators
      ?.filter((l: any) => l.id !== repositoryObject.preferredLocatorId)
      .map((l: any) => ({ strategy: l.strategy, value: l.value })) || [];

    return {
      preferredLocator: { strategy: preferred.strategy, value: preferred.value },
      fallbackLocators: fallbacks,
      resolutionPolicy: fallbacks.length > 0 ? 'fallback' : 'strict'
    };
  }
}
