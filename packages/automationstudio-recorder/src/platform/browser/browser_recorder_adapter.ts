import { PlatformRecorderAdapter, RecorderEventHandler } from '../platform_recorder_adapter';
import { RecorderAdapterContract } from '@automation-studio/types';
import { BrowserEventSource } from './browser_event_source';
import { BrowserSnapshotProvider } from './browser_snapshot_provider';

export class BrowserRecorderAdapter implements PlatformRecorderAdapter {
  public readonly contract: RecorderAdapterContract = {
    id: 'browser-recorder-default',
    kind: 'recorder',
    source: 'browser',
    priority: 100,
    supportedEventSources: ['browser'],
    supportedEventTypes: ['navigation', 'click', 'input', 'change', 'keydown', 'mousemove', 'scroll'],
    supportedPlatforms: ['web'],
    capabilities: ['domInspection', 'frameInspection', 'shadowDomInspection']
  };

  private handler?: RecorderEventHandler;

  constructor(
    private eventSource: BrowserEventSource,
    private snapshotProvider: BrowserSnapshotProvider
  ) {}

  async initialize(): Promise<void> {
    this.eventSource.onNativeEvent((event) => {
      if (!this.handler) return;
      // Provide the snapshot logic
      const snapshot = event.targetElement ? this.snapshotProvider.captureSnapshot(event.targetElement) : undefined;
      
      const interactionTarget = snapshot ? {
        elementId: snapshot.elementId,
        framePath: snapshot.framePath,
        snapshotRef: snapshot.refId
      } : undefined;

      this.handler({
        eventId: `evt-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        sessionId: '', // set by correlator
        sequenceNumber: 0, // set by sequencer
        source: 'browser',
        timestamp: new Date().toISOString(),
        type: event.type,
        payload: event.payload,
        interactionTarget
      });
    });
  }

  onEvent(handler: RecorderEventHandler): void {
    this.handler = handler;
  }

  async start(): Promise<void> {
    await this.eventSource.startListening();
  }

  async pause(): Promise<void> {
    await this.eventSource.stopListening();
  }

  async resume(): Promise<void> {
    await this.eventSource.startListening();
  }

  async stop(): Promise<void> {
    await this.eventSource.stopListening();
  }

  async dispose(): Promise<void> {
    await this.eventSource.dispose();
  }
}
