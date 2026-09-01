import { RecorderAdapterContract } from '@automation-studio/types';
import { PlatformRecorderAdapter } from './platform_recorder_adapter';

/**
 * Registry for managing and selecting Recorder Adapters based on capabilities.
 */
export class RecorderAdapterRegistry {
  private adapters = new Map<string, PlatformRecorderAdapter>();

  register(adapter: PlatformRecorderAdapter): void {
    if (this.adapters.has(adapter.contract.id)) {
      throw new Error(`Recorder adapter with ID ${adapter.contract.id} is already registered.`);
    }
    this.adapters.set(adapter.contract.id, adapter);
  }

  get(id: string): PlatformRecorderAdapter | undefined {
    return this.adapters.get(id);
  }

  getAll(): PlatformRecorderAdapter[] {
    return Array.from(this.adapters.values());
  }

  /**
   * Deterministically selects the best adapter for a given source platform and required capabilities.
   */
  resolve(source: string, requiredCapabilities: string[] = []): PlatformRecorderAdapter | undefined {
    const candidates = this.getAll().filter(adapter => {
      // Must support the source
      if (!adapter.contract.supportedEventSources.includes(source)) {
        return false;
      }
      
      // Must have all required capabilities
      const hasAllCaps = requiredCapabilities.every(cap => adapter.contract.capabilities.includes(cap));
      if (!hasAllCaps) {
        return false;
      }
      
      return true;
    });

    if (candidates.length === 0) {
      return undefined;
    }

    // Sort by priority descending
    candidates.sort((a, b) => b.contract.priority - a.contract.priority);
    return candidates[0];
  }
}
