export type CapabilityType = 'executor' | 'reporter' | 'ai' | 'secrets-provider' | 'data-generator' | 'custom-reporter';

export interface ExecutorCapability {
  fileExtensions: string[];
}

export interface AutomationPluginManifest {
  id: string;
  name: string;
  version: string;
  description?: string;
  author?: string;
  main?: string; // Entry point
  engine: string; // Compatible runtime version
  dependencies?: Record<string, string>; // plugin ID -> version requirement
  capabilities: string[]; // e.g. "executor", "recorder"
  executor?: ExecutorCapability;
  [key: string]: unknown;
}

export interface IPluginContext {
  logger: any; // We'll refine this later
  eventBus: any;
  config: any;
  registerHook(hookName: string, callback: (...args: any[]) => void | Promise<void>): void;
}

export enum PluginState {
  Discovered = 'discovered',
  Loading = 'loading',
  Active = 'active',
  Error = 'error',
  Unloading = 'unloading',
  Unloaded = 'unloaded',
  Disabled = 'disabled'
}

export interface IPluginManifest {
  id: string;
  name: string;
  version: string;
  description?: string;
  author?: string;
  main?: string; // Entry point
  capabilities: string[]; // Keep string[] for compatibility with older code, or CapabilityType[] if updated
  [key: string]: unknown;
}

export interface IPlugin {
  readonly manifest: IPluginManifest;
  activate(): Promise<void>;
  deactivate(): Promise<void>;
}

export interface PluginHealthReport {
  totalPlugins: number;
  activePlugins: number;
  errorPlugins: number;
  plugins: {
    id: string;
    state: PluginState;
    health: any;
  }[];
}

export interface IPluginHost {
  registerPlugin(manifest: IPluginManifest): void;
  loadPlugin(pluginId: string): Promise<void>;
  unloadPlugin(pluginId: string): Promise<void>;
  discover(directory: string): Promise<ReadonlyArray<IPluginManifest>>;
  health(): PluginHealthReport;
  getPlugin(pluginId: string): IPlugin | undefined;
  getLoadedPlugins(): ReadonlyArray<IPlugin>;
}

