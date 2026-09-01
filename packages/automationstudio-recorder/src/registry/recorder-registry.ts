/**
 * Interfaces and types for the VS Code extension layer's recorder integration.
 * These provide the plugin registry pattern used by the app's DI container.
 */

// ── Raw event as seen by the VS Code extension pipeline ──

export interface RawEvent {
  type: string;
  timestamp: string;
  x?: number;
  y?: number;
  key?: string;
  action?: string;
  metadata?: Record<string, unknown>;
}

// ── Pipeline stage types ──

export interface PipelineNormalizedEvent extends RawEvent {
  normalizedX?: number;
  normalizedY?: number;
}

export interface ValidatedEvent extends PipelineNormalizedEvent {
  isValid: boolean;
  validationReason?: string;
}

export interface ResolvedEvent extends ValidatedEvent {
  targetElement?: string;
  targetName?: string;
  targetRole?: string;
}

export interface SemanticAction {
  id: string;
  action: string;
  target: string;
  parameters: Record<string, unknown>;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export interface PipelineResult<T = unknown> {
  data?: T;
  errors: string[];
  warnings: string[];
}

// ── Record session (extension-level) ──

export interface RecordSession {
  id: string;
  name?: string;
  technology: string;
  startedAt: string;
  stoppedAt?: string;
  events: RawEvent[];
  metadata?: Record<string, unknown>;
}

// ── Recorder plugin contract ──

export interface IRecorderPlugin {
  readonly id: string;
  readonly name: string;
  readonly technology: string;
  start(): Promise<void>;
  stop(): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  onEvent(callback: (event: RawEvent) => void): void;
  dispose(): void;
}

// ── Recorder registry ──

export interface IRecorderRegistry {
  register(plugin: IRecorderPlugin): void;
  unregister(id: string): void;
  get(id: string): IRecorderPlugin | undefined;
  getAll(): IRecorderPlugin[];
  getByTechnology(technology: string): IRecorderPlugin | undefined;
}

export class RecorderRegistry implements IRecorderRegistry {
  private plugins = new Map<string, IRecorderPlugin>();

  register(plugin: IRecorderPlugin): void {
    this.plugins.set(plugin.id, plugin);
  }

  unregister(id: string): void {
    this.plugins.delete(id);
  }

  get(id: string): IRecorderPlugin | undefined {
    return this.plugins.get(id);
  }

  getAll(): IRecorderPlugin[] {
    return Array.from(this.plugins.values());
  }

  getByTechnology(technology: string): IRecorderPlugin | undefined {
    return this.getAll().find(p => p.technology === technology);
  }
}
