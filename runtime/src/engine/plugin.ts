/**
 * Runtime plugin interfaces.
 * Re-exports IPluginContext from types and defines the RuntimePlugin contract.
 */

import type { IPluginContext } from '@automation-studio/types';

// Re-export for backward compatibility
export type { IPluginContext as PluginContext } from '@automation-studio/types';

export interface RuntimePlugin {
  name: string;
  version: string;
  
  initialize(context: IPluginContext): Promise<void>;
  execute?(scenarioPath: string): Promise<void>;
  shutdown(): Promise<void>;
  dispose(): Promise<void>;
}
