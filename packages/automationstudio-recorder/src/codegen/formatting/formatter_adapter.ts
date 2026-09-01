export interface FormatterAdapter {
  format(source: string): Promise<string>;
}

export class DummyFormatterAdapter implements FormatterAdapter {
  async format(source: string): Promise<string> {
    // A real implementation would invoke Prettier or ESLint.
    // For now, return the source unchanged.
    return source;
  }
}
