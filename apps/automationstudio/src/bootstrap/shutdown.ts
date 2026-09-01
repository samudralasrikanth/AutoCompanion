/**
 * Shutdown handler - orchestrates graceful extension deactivation.
 *
 * Sequence:
 * 1. Emit ExtensionDeactivating
 * 2. Flush logs
 * 3. Save state
 * 4. Dispose services (reverse order)
 * 5. Dispose provider
 */

import type { IServiceProvider, IEventBus, ILogger } from '@automation-studio/types';
import { createEvent, PlatformEvents, type ExtensionDeactivatingPayload } from '@automation-studio/events';
import { TYPES } from '../di/types';
import { DeactivationError } from '../errors/extension-error';

export async function shutdown(provider: IServiceProvider): Promise<void> {
  try {
    // Try to resolve logger and event bus for graceful shutdown logging
    const logger = provider.tryResolve<ILogger>(TYPES.Logger);
    const eventBus = provider.tryResolve<IEventBus>(TYPES.EventBus);

    logger?.info('Shutting down Automation Studio...');

    // Emit deactivating event
    if (eventBus) {
      eventBus.publish(
        createEvent<ExtensionDeactivatingPayload>(PlatformEvents.ExtensionDeactivating, {
          reason: 'extension-deactivate',
        }),
      );
    }

    // Flush logs
    if (logger && 'flush' in logger) {
      await logger.flush();
    }

    // Dispose provider (handles all service disposal in reverse order)
    await provider.dispose();
  } catch (error) {
    throw new DeactivationError(
      error instanceof Error ? error.message : String(error),
      { cause: error instanceof Error ? error : undefined },
    );
  }
}
