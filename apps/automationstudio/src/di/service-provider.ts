/**
 * Service Provider - the DI resolution engine.
 *
 * Features:
 * - Singleton caching
 * - Transient creation
 * - Lazy proxy resolution
 * - Circular dependency detection with full chain reporting
 * - Ordered disposal (reverse creation order)
 */

import {
  ServiceLifetime,
  type IServiceProvider,
  type ServiceDescriptor,
  type ServiceIdentifier,
  type IAsyncDisposable,
} from '@automation-studio/types';
import { CircularDependencyError, ServiceResolutionError } from '../errors/extension-error';
import type { ServiceCollection } from './service-collection';

export class ServiceProvider implements IServiceProvider {
  private readonly descriptors: Map<ServiceIdentifier, ServiceDescriptor>;
  private readonly singletons: Map<ServiceIdentifier, unknown> = new Map();
  private readonly disposables: Array<{ identifier: ServiceIdentifier; instance: unknown }> = [];
  private readonly resolutionStack: Set<ServiceIdentifier> = new Set();
  private disposed = false;

  constructor(collection: ServiceCollection) {
    const descriptorArray = collection.getDescriptors();
    this.descriptors = new Map(descriptorArray.map((d) => [d.identifier, d]));
  }

  public resolve<T>(identifier: ServiceIdentifier<T>): T {
    this.ensureNotDisposed();

    const descriptor = this.descriptors.get(identifier);
    if (!descriptor) {
      throw new ServiceResolutionError(identifier.toString(), {
        context: {
          registeredServices: Array.from(this.descriptors.keys()).map(String),
        },
      });
    }

    return this.resolveDescriptor(descriptor) as T;
  }

  public tryResolve<T>(identifier: ServiceIdentifier<T>): T | undefined {
    this.ensureNotDisposed();

    if (!this.descriptors.has(identifier)) {
      return undefined;
    }

    return this.resolve(identifier);
  }

  public has(identifier: ServiceIdentifier): boolean {
    return this.descriptors.has(identifier);
  }

  public createScope(): IServiceProvider {
    return new ServiceProvider(this.toCollection());
  }

  public async dispose(): Promise<void> {
    if (this.disposed) {
      return;
    }
    this.disposed = true;

    // Dispose in reverse creation order
    const toDispose = [...this.disposables].reverse();
    for (const { instance } of toDispose) {
      if (instance && typeof instance === 'object' && 'dispose' in instance) {
        const disposable = instance as IAsyncDisposable;
        try {
          await disposable.dispose();
        } catch {
          // Log but don't throw during disposal
        }
      }
    }

    this.singletons.clear();
    this.disposables.length = 0;
  }

  private resolveDescriptor(descriptor: ServiceDescriptor): unknown {
    // Check for circular dependencies
    if (this.resolutionStack.has(descriptor.identifier)) {
      const chain = [...this.resolutionStack, descriptor.identifier].map(String);
      throw new CircularDependencyError(chain);
    }

    // Return cached singleton if available
    if (
      descriptor.lifetime === ServiceLifetime.Singleton &&
      this.singletons.has(descriptor.identifier)
    ) {
      return this.singletons.get(descriptor.identifier);
    }

    // Handle lazy resolution
    if (descriptor.lazy && descriptor.lifetime === ServiceLifetime.Singleton) {
      return this.createLazyProxy(descriptor);
    }

    return this.createInstance(descriptor);
  }

  private createInstance(descriptor: ServiceDescriptor): unknown {
    this.resolutionStack.add(descriptor.identifier);
    try {
      // Resolve dependencies first
      for (const depId of descriptor.dependencies) {
        if (!this.descriptors.has(depId)) {
          throw new ServiceResolutionError(
            `Dependency ${depId.toString()} of ${descriptor.identifier.toString()}`,
          );
        }
      }

      const instance = descriptor.factory(this);

      if (descriptor.lifetime === ServiceLifetime.Singleton) {
        this.singletons.set(descriptor.identifier, instance);
      }

      this.disposables.push({ identifier: descriptor.identifier, instance });
      return instance;
    } finally {
      this.resolutionStack.delete(descriptor.identifier);
    }
  }

  private createLazyProxy(descriptor: ServiceDescriptor): unknown {
    let resolved: unknown = undefined;
    let isResolved = false;

    const provider = this;

    return new Proxy(
      {},
      {
        get(_target: object, prop: string | symbol): unknown {
          if (!isResolved) {
            resolved = provider.createInstance(descriptor);
            isResolved = true;
          }
          const resolvedObj = resolved as Record<string | symbol, unknown>;
          const value = resolvedObj[prop];
          if (typeof value === 'function') {
            return (value as (...args: unknown[]) => unknown).bind(resolved);
          }
          return value;
        },
        has(_target: object, prop: string | symbol): boolean {
          if (!isResolved) {
            resolved = provider.createInstance(descriptor);
            isResolved = true;
          }
          return prop in (resolved as object);
        },
      },
    );
  }

  private toCollection(): ServiceCollection {
    // This is internal - creates a new collection from current descriptors for scoping
    const { ServiceCollection: SC } = require('./service-collection') as {
      ServiceCollection: new () => ServiceCollection;
    };
    const collection = new SC();
    for (const descriptor of this.descriptors.values()) {
      if (descriptor.lifetime === ServiceLifetime.Singleton) {
        collection.addSingleton(descriptor.identifier, descriptor.factory, {
          lazy: descriptor.lazy,
          dependencies: [...descriptor.dependencies],
        });
      } else {
        collection.addTransient(descriptor.identifier, descriptor.factory, {
          lazy: descriptor.lazy,
          dependencies: [...descriptor.dependencies],
        });
      }
    }
    return collection;
  }

  private ensureNotDisposed(): void {
    if (this.disposed) {
      throw new ServiceResolutionError('ServiceProvider has been disposed');
    }
  }
}
