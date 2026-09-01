/**
 * Extension lifecycle types.
 * Defines the activation/deactivation phases and bootstrap contract.
 */

// ─── Bootstrap Phase ─────────────────────────────────────────────────────────

export enum BootstrapPhase {
  Starting = 'starting',
  LoadingConfiguration = 'loadingConfiguration',
  InitializingContainer = 'initializingContainer',
  RegisteringServices = 'registeringServices',
  InitializingServices = 'initializingServices',
  RegisteringCommands = 'registeringCommands',
  RegisteringViews = 'registeringViews',
  Ready = 'ready',
  ShuttingDown = 'shuttingDown',
  Disposed = 'disposed',
}

// ─── Lifecycle Service ───────────────────────────────────────────────────────

export interface ILifecycleService {
  readonly phase: BootstrapPhase;

  onPhaseChange(handler: (phase: BootstrapPhase) => void): { dispose(): void };

  onReady(handler: () => void): { dispose(): void };

  onShutdown(handler: () => Promise<void>): { dispose(): void };
}

// ─── Activation Context ──────────────────────────────────────────────────────

export interface ActivationContext {
  readonly extensionPath: string;
  readonly storagePath: string;
  readonly globalStoragePath: string;
  readonly logPath: string;
  readonly extensionMode: 'production' | 'development' | 'test';
}
