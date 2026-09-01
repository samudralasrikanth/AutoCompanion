import { CodeEmitter, EmissionResult } from './code_emitter';
import { CodeGenerationIR } from '../ir/code_ir';
import { ActionNode, AssertionNode, ControlFlowNode, IRNode } from '../ir/ir_nodes';
import { GenerationDiagnostic } from '@automation-studio/types';

export class StructuralTypeScriptEmitter implements CodeEmitter {
  readonly id = 'generic-ts';
  readonly language = 'typescript';
  readonly framework = 'generic';

  readonly capabilities = {
    supportedOperations: new Set(['CLICK', 'TYPE', 'KEYPRESS', 'SELECT', 'HOVER', 'SCREENSHOT']),
    supportedAssertions: new Set(['visible', 'hidden', 'text', 'value', 'attribute', 'count']),
    locatorFallback: true,
    iframe: true,
    shadowDom: true
  };

  emit(ir: CodeGenerationIR): EmissionResult {
    const diagnostics: GenerationDiagnostic[] = [];
    const lines: string[] = [];

    // 1. Imports
    for (const imp of ir.imports) {
      if (imp.defaultImport) {
        lines.push(`import ${imp.name} from '${imp.source}';`);
      } else {
        lines.push(`import { ${imp.name} } from '${imp.source}';`);
      }
    }
    if (ir.imports.length > 0) lines.push('');

    // 2. Variables
    for (const variable of ir.variables) {
      const typeStr = variable.type ? `: ${variable.type}` : '';
      lines.push(`const ${variable.name}${typeStr} = ${JSON.stringify(variable.value)};`);
    }
    if (ir.variables.length > 0) lines.push('');

    lines.push('export async function runTest() {');

    // 3. Setup (ignored for structural dummy emitter)
    
    // 4. Body
    for (const node of ir.body) {
      lines.push(this.emitNode(node, diagnostics, '  '));
    }

    lines.push('}');

    return {
      source: lines.join('\n'),
      diagnostics
    };
  }

  private emitNode(node: IRNode, diagnostics: GenerationDiagnostic[], indent: string): string {
    switch (node.kind) {
      case 'ActionNode':
        return this.emitAction(node as ActionNode, diagnostics, indent);
      case 'AssertionNode':
        return this.emitAssertion(node as AssertionNode, diagnostics, indent);
      case 'WaitNode':
        return `${indent}// WAIT ${(node as any).durationMs}ms`;
      case 'NavigationNode':
        return `${indent}// NAVIGATE to ${(node as any).url}`;
      case 'CommentNode':
        return `${indent}// ${(node as any).text}`;
      case 'ControlFlowNode':
        return this.emitControlFlow(node as ControlFlowNode, diagnostics, indent);
      default:
        return `${indent}// UNKNOWN NODE: ${(node as any).kind}`;
    }
  }

  private emitAction(node: ActionNode, diagnostics: GenerationDiagnostic[], indent: string): string {
    if (!this.capabilities.supportedOperations.has(node.operation)) {
      diagnostics.push({
        code: 'GEN005',
        severity: 'ERROR',
        message: `Emitter does not support operation: ${node.operation}`,
        sourceLocation: node.traceability
      });
      return `${indent}// ERROR: Unsupported operation ${node.operation}`;
    }

    const targetStr = node.target ? `target: ${node.target.preferredLocator.value}` : 'target: none';
    return `${indent}await performAction('${node.operation}', { ${targetStr} });`;
  }

  private emitAssertion(node: AssertionNode, diagnostics: GenerationDiagnostic[], indent: string): string {
    if (!this.capabilities.supportedAssertions.has(node.assertionType)) {
      diagnostics.push({
        code: 'GEN005',
        severity: 'ERROR',
        message: `Emitter does not support assertion: ${node.assertionType}`,
        sourceLocation: node.traceability
      });
      return `${indent}// ERROR: Unsupported assertion ${node.assertionType}`;
    }

    return `${indent}await assertCondition('${node.assertionType}');`;
  }

  private emitControlFlow(node: ControlFlowNode, diagnostics: GenerationDiagnostic[], indent: string): string {
    const lines: string[] = [];
    if (node.construct === 'if') {
      lines.push(`${indent}if (condition) {`);
    } else if (node.construct === 'loop') {
      lines.push(`${indent}while (condition) {`);
    } else {
      lines.push(`${indent}try {`);
    }

    for (const child of node.children) {
      lines.push(this.emitNode(child, diagnostics, indent + '  '));
    }

    lines.push(`${indent}}`);
    return lines.join('\n');
  }
}
