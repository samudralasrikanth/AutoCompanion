import type { TechnologyRegistry, ITechnologyAdapter } from './technology-registry';
import type { PluginLoader, PluginMetrics } from './plugin-loader';

export interface IFrameworkMetadata {
  id: string;
  name: string;
  description: string;
  version: string;
  installed: boolean;
  type: 'core' | 'plugin';
  metrics?: PluginMetrics;
}

export class FrameworkManager {
  constructor(
    private readonly registry: TechnologyRegistry,
    private readonly pluginLoader?: PluginLoader
  ) {}

  public getFrameworks(): IFrameworkMetadata[] {
    // In a real scenario, this would query the local file system or a marketplace API 
    // to find available but uninstalled frameworks, and map them with `installed: true`
    // if they exist in the TechnologyRegistry.

    const installed = this.registry.getAllAdapters().map(adapter => ({
      id: adapter.id,
      name: adapter.name,
      description: `Provides automation capabilities for ${adapter.capabilities.join(', ')}`,
      version: adapter.version,
      installed: true,
      type: 'plugin' as const,
      metrics: this.pluginLoader?.getMetrics(adapter.id)
    }));

    // Mocking available uninstalled frameworks
    const available: IFrameworkMetadata[] = [
      { id: 'desktop', name: 'Desktop Automation', description: 'Windows UI Automation and WinAppDriver', version: '1.0.0', installed: false, type: 'plugin' },
      { id: 'sap', name: 'SAP Automation', description: 'SAP GUI scripting integration', version: '1.0.0', installed: false, type: 'plugin' },
      { id: 'vision', name: 'Vision & OCR', description: 'Computer vision and coordinate based recorder', version: '1.0.0', installed: false, type: 'plugin' },
    ];

    // Merge lists, filtering out available ones that are already installed
    const installedIds = new Set(installed.map(i => i.id));
    const uninstalled = available.filter(a => !installedIds.has(a.id));

    return [...installed, ...uninstalled];
  }

  public async installFramework(id: string): Promise<void> {
    // Placeholder for npm install logic or extension downloading
    throw new Error(`Installing ${id} is not implemented yet. Connect to Extension Marketplace API.`);
  }

  public async uninstallFramework(id: string): Promise<void> {
    // Placeholder for npm uninstall logic
    throw new Error(`Uninstalling ${id} is not implemented yet.`);
  }
}
