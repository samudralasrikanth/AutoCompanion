import type { AutomationPluginManifest } from '@automation-studio/types';

export interface IMarketplaceClient {
  getAvailablePlugins(): Promise<AutomationPluginManifest[]>;
  getPluginVersions(pluginId: string): Promise<string[]>;
  downloadPlugin(pluginId: string, version: string): Promise<void>;
}

export class MockMarketplaceClient implements IMarketplaceClient {
  private mockRegistry: Record<string, AutomationPluginManifest[]> = {
    'playwright': [
      { id: 'playwright', name: 'Playwright Framework', version: '1.0.0', engine: '>=0.1.0', capabilities: ['executor', 'recorder'] }
    ],
    'selenium': [
      { id: 'selenium', name: 'Selenium WebDriver', version: '1.2.0', engine: '>=0.1.0', capabilities: ['executor'] }
    ],
    'desktop': [
      { id: 'desktop', name: 'Desktop UI Automation', version: '2.0.0', engine: '>=0.1.0', capabilities: ['executor', 'inspector'] }
    ]
  };

  public async getAvailablePlugins(): Promise<AutomationPluginManifest[]> {
    return new Promise(resolve => {
      setTimeout(() => {
        const latestPlugins = Object.values(this.mockRegistry)
          .map(versions => versions[versions.length - 1])
          .filter((v): v is AutomationPluginManifest => v !== undefined);
        resolve(latestPlugins);
      }, 500);
    });
  }

  public async getPluginVersions(pluginId: string): Promise<string[]> {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        const versions = this.mockRegistry[pluginId];
        if (!versions) {
          reject(new Error(`Plugin ${pluginId} not found in marketplace`));
        } else {
          resolve(versions.map(v => v.version));
        }
      }, 300);
    });
  }

  public async downloadPlugin(pluginId: string, version: string): Promise<void> {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        const versions = this.mockRegistry[pluginId];
        if (!versions || !versions.find(v => v.version === version)) {
          reject(new Error(`Plugin ${pluginId}@${version} not found in marketplace`));
        } else {
          // Mock download process
          resolve();
        }
      }, 1000);
    });
  }
}
