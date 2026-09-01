import { PlatformRecorderAdapter, RecorderEventHandler } from '../platform_recorder_adapter';
import { RecorderAdapterContract } from '@automation-studio/types';
import { WindowsUIAProvider } from './windows_uia_provider';

export class DesktopRecorderAdapter implements PlatformRecorderAdapter {
  public readonly contract: RecorderAdapterContract = {
    id: 'desktop-recorder-default',
    kind: 'recorder',
    source: 'desktop',
    priority: 100,
    supportedEventSources: ['desktop'],
    supportedEventTypes: ['Invoke', 'Selection', 'TextChanged', 'FocusChanged'],
    supportedPlatforms: ['windows'],
    capabilities: ['uiaInspection']
  };

  private handler?: RecorderEventHandler;

  constructor(private uiaProvider: WindowsUIAProvider) {}

  async initialize(): Promise<void> {
    this.uiaProvider.onUIAEvent((event) => {
      if (!this.handler) return;

      const element = event.targetElement ? this.uiaProvider.extractElement(event.targetElement) : undefined;

      const interactionTarget = element ? {
        elementId: element.automationId || element.name || 'unknown',
        framePath: [], // Desktop doesn't use frames
        snapshotRef: `uia-${Date.now()}`
      } : undefined;

      this.handler({
        eventId: `evt-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        sessionId: '', 
        sequenceNumber: 0,
        source: 'desktop',
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
    await this.uiaProvider.startListening();
  }

  async pause(): Promise<void> {
    await this.uiaProvider.stopListening();
  }

  async resume(): Promise<void> {
    await this.uiaProvider.startListening();
  }

  async stop(): Promise<void> {
    await this.uiaProvider.stopListening();
  }

  async dispose(): Promise<void> {
    await this.uiaProvider.dispose();
  }
}
