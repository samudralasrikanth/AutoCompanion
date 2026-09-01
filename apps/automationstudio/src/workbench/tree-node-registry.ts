import type { IDisposable, ILogger } from '@automation-studio/types';
import type { ITreeNodeProvider, ITreeNodeRegistry } from './workbench-types';
import { toDisposable } from '@automation-studio/shared';

export class TreeNodeRegistry implements ITreeNodeRegistry {
  private readonly providers = new Map<string, ITreeNodeProvider>();
  private readonly changeListeners = new Set<() => void>();

  constructor(private readonly logger: ILogger) {}

  public registerProvider(provider: ITreeNodeProvider): IDisposable {
    if (this.providers.has(provider.providerId)) {
      this.logger.warn(`Overwriting existing tree node provider: ${provider.providerId}`);
    }
    
    this.providers.set(provider.providerId, provider);
    this.logger.debug(`Registered Tree Node Provider: ${provider.providerId}`);
    
    this.fireTreeDataChanged();
    
    return toDisposable(() => {
      this.providers.delete(provider.providerId);
      this.fireTreeDataChanged();
    });
  }

  public getProviders(): ITreeNodeProvider[] {
    return Array.from(this.providers.values());
  }

  public onDidChangeTreeData(listener: () => void): IDisposable {
    this.changeListeners.add(listener);
    return toDisposable(() => this.changeListeners.delete(listener));
  }

  public fireTreeDataChanged(): void {
    for (const listener of this.changeListeners) {
      try {
        listener();
      } catch (err) {
        this.logger.error('Error in TreeNodeRegistry listener', err as Error);
      }
    }
  }
}
