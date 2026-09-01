import type { AutomationPluginManifest, PluginState } from '@automation-studio/types';

export interface IPluginLifecycleManager {
  install(manifest: AutomationPluginManifest): Promise<void>;
  enable(pluginId: string): Promise<void>;
  disable(pluginId: string): Promise<void>;
  update(manifest: AutomationPluginManifest): Promise<void>;
  unload(pluginId: string): Promise<void>;
  remove(pluginId: string): Promise<void>;
  getState(pluginId: string): PluginState | undefined;
}

export class PluginLifecycleManager implements IPluginLifecycleManager {
  private pluginStates = new Map<string, PluginState>();

  public async install(manifest: AutomationPluginManifest): Promise<void> {
    this.pluginStates.set(manifest.id, 'discovered' as PluginState);
    // In reality: download package, extract to local plugin directory, etc.
  }

  public async enable(pluginId: string): Promise<void> {
    const state = this.pluginStates.get(pluginId);
    if (state === 'disabled' || state === 'discovered' || state === 'unloaded') {
      this.pluginStates.set(pluginId, 'loading' as PluginState);
      // Actual load happens here
      this.pluginStates.set(pluginId, 'active' as PluginState);
    }
  }

  public async disable(pluginId: string): Promise<void> {
    this.pluginStates.set(pluginId, 'disabled' as PluginState);
  }

  public async update(manifest: AutomationPluginManifest): Promise<void> {
    await this.disable(manifest.id);
    await this.install(manifest); // re-install with new version
  }

  public async unload(pluginId: string): Promise<void> {
    this.pluginStates.set(pluginId, 'unloading' as PluginState);
    // clean up memory/hooks
    this.pluginStates.set(pluginId, 'unloaded' as PluginState);
  }

  public async remove(pluginId: string): Promise<void> {
    await this.unload(pluginId);
    this.pluginStates.delete(pluginId);
    // remove files from disk
  }

  public getState(pluginId: string): PluginState | undefined {
    return this.pluginStates.get(pluginId);
  }
}
