import { CodeGenerationRequest, CodeGenerationResult, GenerationDiagnostic } from '@automation-studio/types';
import { GenerationContext } from './generation_context';
import { IRBuilder } from './ir/ir_builder';
import { defaultActionRegistry } from './translators/action_translator';
import { AssertionTranslator } from './translators/assertion_translator';
import { CodeEmitter } from './emitters/code_emitter';
import { FormatterAdapter } from './formatting/formatter_adapter';
import { DiagnosticCodes } from './generation_diagnostics';
import { IRValidator } from './ir/ir_validator';

export class CodeGenerator {
  constructor(
    private emitter: CodeEmitter,
    private formatter?: FormatterAdapter
  ) {}

  async generate(request: CodeGenerationRequest): Promise<CodeGenerationResult> {
    const context = new GenerationContext(request);
    const builder = new IRBuilder(context.generationId);
    let success = true;

    // 1. IR_BUILD
    for (const action of request.actions || []) {
      if (action.type === 'assert') {
        const assertionNode = AssertionTranslator.translate(action, request.repository || {});
        if (assertionNode) {
          builder.addNode(assertionNode);
        } else {
          builder.addDiagnostic({
            code: DiagnosticCodes.INVALID_ACTION,
            severity: 'ERROR',
            message: `Failed to translate assertion: ${action.id}`
          });
          success = false;
        }
      } else {
        const node = defaultActionRegistry.translate(action, request.repository || {});
        if (node) {
          builder.addNode(node);
        } else {
          builder.addDiagnostic({
            code: DiagnosticCodes.INVALID_ACTION,
            severity: 'ERROR',
            message: `Unknown or unsupported action type: ${action.type}`
          });
          success = false;
        }
      }
    }

    const ir = builder.build();

    // 2. IR_VALIDATION
    const irDiagnostics = IRValidator.validate(ir);
    ir.diagnostics.push(...irDiagnostics);
    if (irDiagnostics.some(d => d.severity === 'ERROR')) {
      success = false;
    }

    if (!success) {
      return {
        schemaVersion: '1.0',
        contractType: 'codegen-result',
        success: false,
        files: [],
        diagnostics: ir.diagnostics
      };
    }

    // 3. EMISSION
    let source = '';
    try {
      const emission = this.emitter.emit(ir);
      source = emission.source;
      ir.diagnostics.push(...emission.diagnostics);
      if (emission.diagnostics.some(d => d.severity === 'ERROR')) {
        success = false;
      }
    } catch (err: any) {
      success = false;
      ir.diagnostics.push({
        code: DiagnosticCodes.EMISSION_FAILURE,
        severity: 'ERROR',
        message: `Emission failed: ${err.message}`
      });
    }

    // 4. FORMAT
    if (success && this.formatter) {
      try {
        source = await this.formatter.format(source);
      } catch (err: any) {
        ir.diagnostics.push({
          code: DiagnosticCodes.FORMAT_FAILURE,
          severity: 'WARNING',
          message: `Formatting failed: ${err.message}`
        });
      }
    }

    return {
      schemaVersion: '1.0',
      contractType: 'codegen-result',
      success,
      files: success ? [{ path: 'generated.ts', content: source }] : [],
      diagnostics: ir.diagnostics
    };
  }
}
