/**
 * Dependency Injection types.
 * Defines the contract for service registration, resolution, and lifecycle.
 */

// ─── Disposable ──────────────────────────────────────────────────────────────

export interface IDisposable {
  dispose(): void;
}

export interface IAsyncDisposable {
  dispose(): Promise<void>;
}

// ─── Service Lifetime ────────────────────────────────────────────────────────

export enum ServiceLifetime {
  Singleton = 'singleton',
  Transient = 'transient',
}

// ─── Service Identifier ──────────────────────────────────────────────────────

export type ServiceIdentifier<T = unknown> = symbol & { readonly __type?: T };

export function createServiceIdentifier<T>(name: string): ServiceIdentifier<T> {
  return Symbol(name) as ServiceIdentifier<T>;
}

// ─── Service Descriptor ──────────────────────────────────────────────────────

export interface ServiceFactory<T> {
  (provider: IServiceProvider): T;
}

export interface ServiceDescriptor<T = unknown> {
  readonly identifier: ServiceIdentifier<T>;
  readonly lifetime: ServiceLifetime;
  readonly factory: ServiceFactory<T>;
  readonly lazy: boolean;
  readonly dependencies: ReadonlyArray<ServiceIdentifier>;
}

// ─── Service Collection ──────────────────────────────────────────────────────

export interface IServiceCollection {
  addSingleton<T>(
    identifier: ServiceIdentifier<T>,
    factory: ServiceFactory<T>,
    options?: ServiceRegistrationOptions,
  ): IServiceCollection;

  addTransient<T>(
    identifier: ServiceIdentifier<T>,
    factory: ServiceFactory<T>,
    options?: ServiceRegistrationOptions,
  ): IServiceCollection;

  has(identifier: ServiceIdentifier): boolean;

  getDescriptors(): ReadonlyArray<ServiceDescriptor>;
}

export interface ServiceRegistrationOptions {
  readonly lazy?: boolean;
  readonly dependencies?: ReadonlyArray<ServiceIdentifier>;
}

// ─── Service Provider ────────────────────────────────────────────────────────

export interface IServiceProvider extends IAsyncDisposable {
  resolve<T>(identifier: ServiceIdentifier<T>): T;

  tryResolve<T>(identifier: ServiceIdentifier<T>): T | undefined;

  has(identifier: ServiceIdentifier): boolean;

  createScope(): IServiceProvider;
}
