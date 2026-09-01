import { PlatformRecorderAdapter, RecorderEventHandler } from '../platform_recorder_adapter';
import { RecorderAdapterContract } from '@automation-studio/types';

export interface VisionCaptureAdapterConfig {
  enabled?: boolean;
  captureRate?: number;
  maxFrames?: number;
  captureOnInteraction?: boolean;
  captureOnStateChange?: boolean;
}

export class VisionCaptureAdapter implements PlatformRecorderAdapter {
  public readonly contract: RecorderAdapterContract = {
    id: 'vision-capture-default',
    kind: 'recorder',
    source: 'vision',
    priority: 50,
    supportedEventSources: ['desktop', 'browser'], 
    supportedEventTypes: ['observation'],
    supportedPlatforms: ['web', 'windows', 'citrix'],
    capabilities: ['screenshotCapture']
  };

  private handler?: RecorderEventHandler;
  private intervalId?: any;
  private frameCount: number = 0;

  constructor(private config: VisionCaptureAdapterConfig = {}) {
    // Default config values
    if (this.config.enabled === undefined) this.config.enabled = false;
    if (this.config.captureRate === undefined) this.config.captureRate = 1;
    if (this.config.maxFrames !== undefined && this.config.maxFrames < 0) {
      throw new Error("maxFrames must be >= 0");
    }
  }

  async initialize(): Promise<void> {
    // Initialization of vision capturing capabilities
  }

  onEvent(handler: RecorderEventHandler): void {
    this.handler = handler;
  }

  async start(): Promise<void> {
    if (!this.config.enabled) return;

    const fps = this.config.captureRate || 1;
    if (fps <= 0) return;

    this.intervalId = setInterval(() => {
      // Check maxFrames before capturing
      if (this.config.maxFrames !== undefined && this.frameCount >= this.config.maxFrames) {
        this.pause(); // stops the timer
        return;
      }

      if (this.handler) {
        this.handler({
          eventId: `evt-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          sessionId: '',
          sequenceNumber: 0,
          source: 'vision',
          timestamp: new Date().toISOString(),
          type: 'observation',
          payload: {
            imageArtifact: `screenshot-${Date.now()}.png` 
          }
        });
      }
      this.frameCount++;
    }, 1000 / fps);
  }

  async pause(): Promise<void> {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
  }

  async resume(): Promise<void> {
    await this.start();
  }

  async stop(): Promise<void> {
    await this.pause();
    this.frameCount = 0;
  }

  async dispose(): Promise<void> {
    await this.stop();
  }
}
