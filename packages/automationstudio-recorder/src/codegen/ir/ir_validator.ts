import { CodeGenerationIR } from './code_ir';
import { GenerationDiagnostic } from '@automation-studio/types';

export class IRValidator {
  static validate(ir: CodeGenerationIR): GenerationDiagnostic[] {
    const diagnostics: GenerationDiagnostic[] = [];

    // Basic structural validation on the IR
    if (!ir.metadata.generationId) {
      diagnostics.push({
        code: 'IRV001',
        severity: 'ERROR',
        message: 'Missing generationId in metadata'
      });
    }

    if (ir.body.length === 0 && ir.diagnostics.length === 0) {
      diagnostics.push({
        code: 'IRV002',
        severity: 'WARNING',
        message: 'Empty IR body with no reported diagnostics'
      });
    }

    return diagnostics;
  }
}
