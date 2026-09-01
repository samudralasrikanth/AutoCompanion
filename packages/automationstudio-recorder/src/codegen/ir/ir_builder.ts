import { CodeGenerationIR } from './code_ir';
import { GenerationDiagnostic } from '@automation-studio/types';
import { IRNode } from './ir_nodes';

export class IRBuilder {
  private ir: CodeGenerationIR;

  constructor(generationId: string) {
    this.ir = {
      metadata: {
        generationId,
        version: '1.0'
      },
      imports: [],
      variables: [],
      configuration: {},
      setup: [],
      body: [],
      teardown: [],
      diagnostics: []
    };
  }

  addImport(name: string, source: string, defaultImport = false) {
    if (!this.ir.imports.some(i => i.name === name && i.source === source)) {
      this.ir.imports.push({ name, source, defaultImport });
    }
    return this;
  }

  addVariable(name: string, value: unknown, type?: string) {
    this.ir.variables.push({ name, value, type });
    return this;
  }

  addNode(node: IRNode) {
    this.ir.body.push(node);
    return this;
  }

  addDiagnostic(diagnostic: GenerationDiagnostic) {
    this.ir.diagnostics.push(diagnostic);
    return this;
  }

  build(): CodeGenerationIR {
    // Sort imports lexically for determinism
    this.ir.imports.sort((a, b) => {
      const cmp = a.source.localeCompare(b.source);
      if (cmp !== 0) return cmp;
      return a.name.localeCompare(b.name);
    });

    // Diagnostics ordering: Severity -> Code
    this.ir.diagnostics.sort((a, b) => {
      const severityRank = { ERROR: 0, WARNING: 1, INFO: 2 };
      const rankA = severityRank[a.severity as keyof typeof severityRank] ?? 99;
      const rankB = severityRank[b.severity as keyof typeof severityRank] ?? 99;
      if (rankA !== rankB) return rankA - rankB;
      return a.code.localeCompare(b.code);
    });

    return this.ir;
  }
}
