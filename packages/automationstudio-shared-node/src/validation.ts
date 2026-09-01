/**
 * Input validation utilities.
 */

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function isPositiveNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

export function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

export function isValidIdentifier(value: string): boolean {
  return /^[a-zA-Z_][a-zA-Z0-9_.-]*$/.test(value);
}

export function isValidProjectName(name: string): boolean {
  if (!isNonEmptyString(name)) {
    return false;
  }
  if (name.length > 128) {
    return false;
  }
  return /^[a-zA-Z0-9][a-zA-Z0-9 _-]*$/.test(name);
}

export function isValidVersion(version: string): boolean {
  return /^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/.test(version);
}

export function isValidJsonString(value: string): boolean {
  try {
    JSON.parse(value);
    return true;
  } catch {
    return false;
  }
}

export function validateRequired<T>(value: T | null | undefined, fieldName: string): T {
  if (value === null || value === undefined) {
    throw new Error(`Required field '${fieldName}' is missing`);
  }
  return value;
}

export function validateString(value: unknown, fieldName: string, maxLength = 1024): string {
  if (typeof value !== 'string') {
    throw new Error(`Field '${fieldName}' must be a string`);
  }
  if (value.length > maxLength) {
    throw new Error(`Field '${fieldName}' exceeds maximum length of ${maxLength}`);
  }
  return value;
}

export function validateEnum<T extends string>(
  value: unknown,
  validValues: ReadonlyArray<T>,
  fieldName: string,
): T {
  if (typeof value !== 'string' || !validValues.includes(value as T)) {
    throw new Error(
      `Field '${fieldName}' must be one of: ${validValues.join(', ')}. Got: ${String(value)}`,
    );
  }
  return value as T;
}
