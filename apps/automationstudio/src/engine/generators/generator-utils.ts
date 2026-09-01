/**
 * Shared utilities for code generators.
 */

/**
 * Escape a string for safe embedding inside a Python double-quoted string literal.
 * Order matters: backslashes first, then quotes, then newlines.
 */
export function pyStr(value: string): string {
  const escaped = value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\r?\n/g, '\\n');
  return `"${escaped}"`;
}
