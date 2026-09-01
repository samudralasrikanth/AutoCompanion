import { PlatformRecorderAdapter, RecorderEventHandler } from '../platform_recorder_adapter';
import { RecorderAdapterContract } from '@automation-studio/types';

export interface RemoteInputCapture {
  onInputEvent(handler: (event: any) => void): void;
  startCapture(): Promise<void>;
  stopCapture(): Promise<void>;
  dispose(): Promise<void>;
}

export class CitrixRecorderAdapter implements PlatformRecorderAdapter {
  public readonly contract: RecorderAdapterContract = {
    id: 'citrix-recorder-default',
    kind: 'recorder',
    source: 'citrix',
    priority: 80,
    supportedEventSources: ['citrix'],
    supportedEventTypes: ['mousedown', 'mouseup', 'keydown', 'keyup', 'mousemove'],
    supportedPlatforms: ['citrix'],
    capabilities: [] // explicitly omitting structured inspection
  };

  private handler?: RecorderEventHandler;

  constructor(private inputCapture: RemoteInputCapture) {}

  async initialize(): Promise<void> {
    this.inputCapture.onInputEvent((event) => {
      if (!this.handler) return;

      this.handler({
        eventId: `evt-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        sessionId: '', 
        sequenceNumber: 0,
        source: 'citrix',
        timestamp: new Date().toISOString(),
        type: event.type,
        payload: {
          ...event.payload,
          structuredInspection: false // Explicitly state no structured inspection available
        }
      });
    });
  }

  onEvent(handler: RecorderEventHandler): void {
    this.handler = handler;
  }

  async start(): Promise<void> {
    await this.inputCapture.startCapture();
  }

  async pause(): Promise<void> {
    await this.inputCapture.stopCapture();
  }

  async resume(): Promise<void> {
    await this.inputCapture.startCapture();
  }

  async stop(): Promise<void> {
    await this.inputCapture.stopCapture();
  }

  async dispose(): Promise<void> {
    await this.inputCapture.dispose();
  }
}
