import { Recorder, RecorderStartOptions, RecordingResult } from './recorder';
import { RecorderSession } from './recorder_session';
import { RecorderState } from './recorder_state';
import { RecorderAdapterRegistry } from '../platform/recorder_adapter_registry';
import { PlatformRecorderAdapter } from '../platform/platform_recorder_adapter';
import { EventQueue } from '../events/event_queue';
import { EventSequencer } from '../events/event_sequencer';
import { EventCorrelator } from '../events/event_correlation';
import { EventNormalizer } from '../events/event_normalizer';

export class RecorderManager implements Recorder {
  private activeSessions: Map<string, RecorderSession> = new Map();
  private adapters: Map<string, PlatformRecorderAdapter> = new Map();

  constructor(
    private registry: RecorderAdapterRegistry,
    private queue: EventQueue,
    private sequencer: EventSequencer,
    private correlator: EventCorrelator,
    private normalizer: EventNormalizer
  ) {
    this.queue.setProcessor(async (event) => {
      // Process events sequentially out of the queue
      this.normalizer.process(event);
    });
  }

  async start(options: RecorderStartOptions): Promise<RecorderSession> {
    const sessionId = `rec-${Date.now()}`;
    const session: RecorderSession = {
      sessionId,
      executionId: options.executionId,
      projectId: options.projectId,
      testId: options.testId,
      source: options.source,
      startedAt: new Date().toISOString(),
      state: RecorderState.STARTING,
      events: [],
      actions: [],
      repository: {},
      metadata: options.metadata || {}
    };

    this.activeSessions.set(sessionId, session);
    
    const adapter = this.registry.resolve(options.source);
    if (!adapter) {
      throw new Error(`No compatible recorder adapter found for source: ${options.source}`);
    }

    this.adapters.set(sessionId, adapter);

    // Orchestration
    this.correlator.updateContext({ sessionId, executionId: options.executionId });
    this.sequencer.reset();

    adapter.onEvent((rawEvent) => {
      const correlated = this.correlator.correlate(rawEvent);
      const sequenced = this.sequencer.sequence(correlated);
      this.queue.enqueue(sequenced);
    });

    await adapter.initialize();
    await adapter.start();

    session.state = RecorderState.RECORDING;
    return session;
  }

  private getSession(sessionId: string): RecorderSession {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      throw new Error(`Recorder session not found: ${sessionId}`);
    }
    return session;
  }

  private getAdapter(sessionId: string): PlatformRecorderAdapter {
    const adapter = this.adapters.get(sessionId);
    if (!adapter) {
      throw new Error(`Recorder adapter not found for session: ${sessionId}`);
    }
    return adapter;
  }

  async pause(sessionId: string): Promise<void> {
    const session = this.getSession(sessionId);
    if (session.state !== RecorderState.RECORDING) {
      throw new Error(`Cannot pause session from state ${session.state}`);
    }
    await this.getAdapter(sessionId).pause();
    session.state = RecorderState.PAUSED;
  }

  async resume(sessionId: string): Promise<void> {
    const session = this.getSession(sessionId);
    if (session.state !== RecorderState.PAUSED) {
      throw new Error(`Cannot resume session from state ${session.state}`);
    }
    await this.getAdapter(sessionId).resume();
    session.state = RecorderState.RECORDING;
  }

  async stop(sessionId: string): Promise<RecordingResult> {
    const session = this.getSession(sessionId);
    if (session.state === RecorderState.STOPPING || session.state === RecorderState.COMPLETED) {
      throw new Error(`Cannot stop session from state ${session.state}`);
    }
    
    session.state = RecorderState.STOPPING;
    const adapter = this.getAdapter(sessionId);
    await adapter.stop();
    await adapter.dispose();

    session.stoppedAt = new Date().toISOString();
    session.state = RecorderState.COMPLETED;

    this.adapters.delete(sessionId);

    return {
      sessionId,
      session
    };
  }

  async cancel(sessionId: string): Promise<void> {
    const session = this.getSession(sessionId);
    if (session.state === RecorderState.COMPLETED || session.state === RecorderState.CANCELLED) {
      throw new Error(`Cannot cancel session from state ${session.state}`);
    }
    
    const adapter = this.getAdapter(sessionId);
    await adapter.stop();
    await adapter.dispose();

    session.state = RecorderState.CANCELLED;
    session.stoppedAt = new Date().toISOString();
    this.adapters.delete(sessionId);
  }
  
  async error(sessionId: string, error: Error): Promise<void> {
    const session = this.getSession(sessionId);
    session.state = RecorderState.ERROR;
    session.stoppedAt = new Date().toISOString();
    session.metadata.error = error.message;
    
    const adapter = this.adapters.get(sessionId);
    if (adapter) {
       await adapter.stop();
       await adapter.dispose();
       this.adapters.delete(sessionId);
    }
  }
}
