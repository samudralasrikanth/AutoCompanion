/**
 * Service Collection - fluent registration API for DI.
 * Services are registered with their lifetime (singleton/transient),
 * factory function, and declared dependencies.
 */

import {
  ServiceLifetime,
  type IServiceCollection,
  type ServiceDescriptor,
  type ServiceFactory,
  type ServiceIdentifier,
  type ServiceRegistrationOptions,
} from '@automation-studio/types';

export class ServiceCollection implements IServiceCollection {
  private readonly descriptors: Map<ServiceIdentifier, ServiceDescriptor> = new Map();

  public addSingleton<T>(
    identifier: ServiceIdentifier<T>,
    factory: ServiceFactory<T>,
    options?: ServiceRegistrationOptions,
  ): IServiceCollection {
    this.register(identifier, factory, ServiceLifetime.Singleton, options);
    return this;
  }

  public addTransient<T>(
    identifier: ServiceIdentifier<T>,
    factory: ServiceFactory<T>,
    options?: ServiceRegistrationOptions,
  ): IServiceCollection {
    this.register(identifier, factory, ServiceLifetime.Transient, options);
    return this;
  }

  public has(identifier: ServiceIdentifier): boolean {
    return this.descriptors.has(identifier);
  }

  public getDescriptors(): ReadonlyArray<ServiceDescriptor> {
    return Array.from(this.descriptors.values());
  }

  public getDescriptor(identifier: ServiceIdentifier): ServiceDescriptor | undefined {
    return this.descriptors.get(identifier);
  }

  private register<T>(
    identifier: ServiceIdentifier<T>,
    factory: ServiceFactory<T>,
    lifetime: ServiceLifetime,
    options?: ServiceRegistrationOptions,
  ): void {
    const descriptor: ServiceDescriptor<T> = {
      identifier,
      lifetime,
      factory,
      lazy: options?.lazy ?? false,
      dependencies: options?.dependencies ?? [],
    };
    this.descriptors.set(identifier, descriptor as ServiceDescriptor);
  }
}
