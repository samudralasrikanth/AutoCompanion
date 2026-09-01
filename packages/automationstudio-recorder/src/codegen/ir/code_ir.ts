import { GenerationDiagnostic } from '@automation-studio/types';
import { IRNode } from './ir_nodes';

export interface CodeGenerationIR {
  metadata: {
    generationId: string;
    timestamp?: string; // Only used for non-deterministic modes, default undefined
    version: string;
    testId?: string;
  };
  imports: { name: string; source: string; defaultImport?: boolean }[];
  variables: { name: string; type?: string; value: unknown }[];
  configuration: Record<string, unknown>;
  setup: IRNode[];
  body: IRNode[];
  teardown: IRNode[];
  diagnostics: GenerationDiagnostic[];
}
