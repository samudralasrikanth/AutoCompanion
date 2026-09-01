/**
 * Command Registry implementation.
 * Declarative command registration with telemetry wrapping.
 */

import * as vscode from 'vscode';
import type { ICommandRegistry, ICommandDescriptor, ILogger, IEventBus } from '@automation-studio/types';
import { createEvent, PlatformEvents, type CommandExecutedPayload } from '@automation-studio/events';
import { DisposableStore, Stopwatch } from '@automation-studio/shared';

export class CommandRegistry implements ICommandRegistry {
  private readonly commands: Map<string, ICommandDescriptor> = new Map();
  private readonly disposables = new DisposableStore();

  constructor(
    private readonly vscodeCommands: typeof vscode.commands,
    private readonly eventBus: IEventBus,
    private readonly logger: ILogger,
  ) {}

  public register(descriptor: ICommandDescriptor): { dispose(): void } {
    if (this.commands.has(descriptor.id)) {
      this.logger.warn(`Command already registered: ${descriptor.id}`);
    }

    this.commands.set(descriptor.id, descriptor);

    const registration = this.vscodeCommands.registerCommand(
      descriptor.id,
      async (...args: unknown[]) => {
        return this.executeHandler(descriptor, args);
      },
    );

    this.disposables.add(registration);

    this.logger.debug(`Command registered: ${descriptor.id}`, {
      category: descriptor.category,
    });

    return {
      dispose: (): void => {
        this.commands.delete(descriptor.id);
        registration.dispose();
      },
    };
  }

  public registerMany(descriptors: ReadonlyArray<ICommandDescriptor>): { dispose(): void } {
    const registrations = descriptors.map((d) => this.register(d));
    return {
      dispose: (): void => {
        for (const reg of registrations) {
          reg.dispose();
        }
      },
    };
  }

  public async execute(commandId: string, ...args: unknown[]): Promise<unknown> {
    return this.vscodeCommands.executeCommand(commandId, ...args);
  }

  public has(commandId: string): boolean {
    return this.commands.has(commandId);
  }

  public getAll(): ReadonlyArray<ICommandDescriptor> {
    return Array.from(this.commands.values());
  }

  public getByCategory(category: string): ReadonlyArray<ICommandDescriptor> {
    return Array.from(this.commands.values()).filter((c) => c.category === category);
  }

  public dispose(): void {
    this.disposables.dispose();
    this.commands.clear();
  }

  private async executeHandler(
    descriptor: ICommandDescriptor,
    args: unknown[],
  ): Promise<unknown> {
    const stopwatch = new Stopwatch().start();
    let success = true;
    let errorMessage: string | undefined;

    try {
      // Check enablement
      if (descriptor.enablement?.condition && !descriptor.enablement.condition()) {
        this.logger.debug(`Command disabled: ${descriptor.id}`);
        return undefined;
      }

      const result = await descriptor.handler(...args);
      return result;
    } catch (error) {
      success = false;
      errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Command failed: ${descriptor.id}`,
        error instanceof Error ? error : new Error(String(error)),
      );
      throw error;
    } finally {
      const duration = stopwatch.stop();

      if (descriptor.telemetry && vscode.env.isTelemetryEnabled) {
        this.eventBus.publish(
          createEvent<CommandExecutedPayload>(PlatformEvents.CommandExecuted, {
            commandId: descriptor.id,
            duration,
            success,
            error: errorMessage,
          }),
        );
      }
    }
  }
}
