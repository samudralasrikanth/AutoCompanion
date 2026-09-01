import { CodeGenerationIR } from '../ir/code_ir';
import { GenerationDiagnostic } from '@automation-studio/types';

export interface EmitterCapabilities {
  supportedOperations: Set<string>;
  supportedAssertions: Set<string>;
  locatorFallback: boolean;
  iframe: boolean;
  shadowDom: boolean;
}

export interface EmissionResult {
  source: string;
  diagnostics: GenerationDiagnostic[];
}

export interface CodeEmitter {
  readonly id: string;
  readonly language: string;
  readonly framework: string;
  readonly capabilities: EmitterCapabilities;

  emit(ir: CodeGenerationIR): EmissionResult;
}
