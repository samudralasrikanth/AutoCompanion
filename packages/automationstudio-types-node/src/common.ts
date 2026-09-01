/**
 * Common types used across the Automation Studio platform.
 * Provides Result, Option, branded types, and utility types.
 */

// ─── Branded Types ───────────────────────────────────────────────────────────

declare const brand: unique symbol;

export type Brand<T, B extends string> = T & { readonly [brand]: B };

export type UUID = Brand<string, 'UUID'>;
export type Timestamp = Brand<number, 'Timestamp'>;
export type CorrelationId = Brand<string, 'CorrelationId'>;
export type FilePath = Brand<string, 'FilePath'>;

// ─── Result Type ─────────────────────────────────────────────────────────────

export type Result<T, E = Error> = OkResult<T> | ErrResult<E>;

export interface OkResult<T> {
  readonly ok: true;
  readonly value: T;
}

export interface ErrResult<E> {
  readonly ok: false;
  readonly error: E;
}

export function ok<T>(value: T): OkResult<T> {
  return { ok: true, value };
}

export function err<E>(error: E): ErrResult<E> {
  return { ok: false, error };
}

export function mapResult<T, U, E>(result: Result<T, E>, fn: (value: T) => U): Result<U, E> {
  if (result.ok) {
    return ok(fn(result.value));
  }
  return result;
}

export function flatMapResult<T, U, E>(
  result: Result<T, E>,
  fn: (value: T) => Result<U, E>,
): Result<U, E> {
  if (result.ok) {
    return fn(result.value);
  }
  return result;
}

export function unwrapResult<T, E>(result: Result<T, E>): T {
  if (result.ok) {
    return result.value;
  }
  throw result.error instanceof Error ? result.error : new Error(String(result.error));
}

export function unwrapResultOr<T, E>(result: Result<T, E>, defaultValue: T): T {
  if (result.ok) {
    return result.value;
  }
  return defaultValue;
}

// ─── Option Type ─────────────────────────────────────────────────────────────

export type Option<T> = Some<T> | None;

export interface Some<T> {
  readonly some: true;
  readonly value: T;
}

export interface None {
  readonly some: false;
}

export function some<T>(value: T): Some<T> {
  return { some: true, value };
}

export function none(): None {
  return { some: false };
}

export function mapOption<T, U>(option: Option<T>, fn: (value: T) => U): Option<U> {
  if (option.some) {
    return some(fn(option.value));
  }
  return option;
}

export function flatMapOption<T, U>(
  option: Option<T>,
  fn: (value: T) => Option<U>,
): Option<U> {
  if (option.some) {
    return fn(option.value);
  }
  return option;
}

export function unwrapOption<T>(option: Option<T>): T {
  if (option.some) {
    return option.value;
  }
  throw new Error('Attempted to unwrap None');
}

export function unwrapOptionOr<T>(option: Option<T>, defaultValue: T): T {
  if (option.some) {
    return option.value;
  }
  return defaultValue;
}

export function fromNullable<T>(value: T | null | undefined): Option<T> {
  if (value === null || value === undefined) {
    return none();
  }
  return some(value);
}

// ─── Utility Types ───────────────────────────────────────────────────────────

export type DeepReadonly<T> = {
  readonly [P in keyof T]: T[P] extends object ? DeepReadonly<T[P]> : T[P];
};

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export interface Timestamped {
  readonly createdAt: Timestamp;
  readonly updatedAt: Timestamp;
}

export interface Identifiable {
  readonly id: UUID;
}
