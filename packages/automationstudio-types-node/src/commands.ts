/**
 * Command system types.
 * Declarative command registration with metadata for UI, telemetry, and enablement.
 */

// ─── Command Descriptor ──────────────────────────────────────────────────────

export interface ICommandDescriptor {
  readonly id: string;
  readonly title: string;
  readonly category: string;
  readonly handler: CommandHandler;
  readonly enablement?: CommandEnablement;
  readonly telemetry: boolean;
}

export type CommandHandler = (...args: unknown[]) => unknown | Promise<unknown>;

// ─── Command Enablement ──────────────────────────────────────────────────────

export interface CommandEnablement {
  readonly when?: string;
  readonly condition?: () => boolean;
}

// ─── Command Registry ────────────────────────────────────────────────────────

export interface ICommandRegistry {
  register(descriptor: ICommandDescriptor): { dispose(): void };

  registerMany(descriptors: ReadonlyArray<ICommandDescriptor>): { dispose(): void };

  execute(commandId: string, ...args: unknown[]): Promise<unknown>;

  has(commandId: string): boolean;

  getAll(): ReadonlyArray<ICommandDescriptor>;

  getByCategory(category: string): ReadonlyArray<ICommandDescriptor>;
}
