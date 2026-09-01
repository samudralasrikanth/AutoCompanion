import { CodeGenerationIR } from './code_ir';

export class IRSerializer {
  static serialize(ir: CodeGenerationIR): string {
    // A deterministic JSON stringification.
    // keys are sorted automatically if we use a stable stringifier, 
    // but a standard JSON.stringify with sorted replacements works for a basic implementation.

    return JSON.stringify(ir, (key, value) => {
      if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        return Object.keys(value).sort().reduce((sorted: any, k) => {
          sorted[k] = value[k];
          return sorted;
        }, {});
      }
      return value;
    }, 2);
  }
}
