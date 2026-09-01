import type { AutomationPluginManifest } from '@automation-studio/types';

export class CapabilityRegistry {
  private plugins: Map<string, AutomationPluginManifest> = new Map();
  private executors: Map<string, string> = new Map(); // extension -> pluginId

  public registerPlugin(manifest: AutomationPluginManifest): void {
    this.plugins.set(manifest.id, manifest);
    
    if (manifest.capabilities.includes('executor') && manifest.executor) {
      for (const ext of manifest.executor.fileExtensions) {
        this.executors.set(ext, manifest.id);
      }
    }
  }

  public getExecutorForExtension(extension: string): string | undefined {
    return this.executors.get(extension);
  }

  public getPluginManifest(pluginId: string): AutomationPluginManifest | undefined {
    return this.plugins.get(pluginId);
  }
}
