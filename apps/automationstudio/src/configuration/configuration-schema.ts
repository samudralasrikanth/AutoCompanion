/**
 * Configuration schema - all settings keys, types, and defaults.
 */

import { ConfigurationScope, type ConfigurationSchemaEntry } from '@automation-studio/types';

export const CONFIGURATION_SECTION = 'automationStudio';

export const CONFIGURATION_SCHEMA: ReadonlyArray<ConfigurationSchemaEntry> = [
  {
    key: 'pythonPath',
    type: 'string',
    defaultValue: 'python',
    description: 'Path to the Python interpreter',
    scope: ConfigurationScope.Workspace,
  },
  {
    key: 'logging.level',
    type: 'string',
    defaultValue: 'info',
    description: 'Logging level',
    enum: ['trace', 'debug', 'info', 'warn', 'error', 'fatal'],
    scope: ConfigurationScope.User,
  },
  {
    key: 'recorder.captureScreenshots',
    type: 'boolean',
    defaultValue: true,
    description: 'Capture screenshots during recording',
    scope: ConfigurationScope.Workspace,
  },
  {
    key: 'report.autoOpen',
    type: 'boolean',
    defaultValue: true,
    description: 'Automatically open reports after generation',
    scope: ConfigurationScope.User,
  },
  {
    key: 'ai.provider',
    type: 'string',
    defaultValue: 'none',
    description: 'AI provider for code generation',
    enum: ['openai', 'anthropic', 'gemini', 'azure', 'openrouter', 'ollama', 'none'],
    scope: ConfigurationScope.User,
  },
  {
    key: 'ai.model',
    type: 'string',
    defaultValue: '',
    description: 'AI model name',
    scope: ConfigurationScope.User,
  },
  {
    key: 'telemetry.enabled',
    type: 'boolean',
    defaultValue: false,
    description: 'Enable anonymous telemetry',
    scope: ConfigurationScope.User,
  },
];

export function getDefaultValue<T>(key: string): T | undefined {
  const entry = CONFIGURATION_SCHEMA.find((e) => e.key === key);
  return entry?.defaultValue as T | undefined;
}

export function getFullKey(key: string): string {
  return `${CONFIGURATION_SECTION}.${key}`;
}
