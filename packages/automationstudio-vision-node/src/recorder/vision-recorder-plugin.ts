import { IRecorderPlugin, RawEvent, RecorderState } from '@automation-studio/recorder';
import { uIOhook, UiohookKey, UiohookMouseEvent, UiohookKeyboardEvent } from 'uiohook-napi';
import { VisionEngine } from '../vision/vision-engine';
import { randomUUID } from 'crypto';

export class VisionRecorderPlugin implements IRecorderPlugin {
  public metadata = {
    id: 'vision',
    displayName: 'Vision Automation',
    technology: 'vision',
    supportsRecording: true,
    supportsPlayback: true,
    supportsOCR: true,
    supportsVision: true
  };
  private callbacks: ((event: RawEvent) => void)[] = [];
  private disconnectCallbacks: (() => void)[] = [];
  private engine: VisionEngine;
  private state: RecorderState = 'idle';

  public getState(): RecorderState { return this.state; }

  constructor() {
    this.engine = new VisionEngine();
  }

  public async start(): Promise<void> {
    if (this.state === 'recording') return;
    this.state = 'recording';

    uIOhook.on('click', this.handleMouseClick.bind(this));
    uIOhook.on('keydown', this.handleKeyDown.bind(this));
    uIOhook.start();
  }

  public async stop(): Promise<void> {
    if (this.state === 'idle' || this.state === 'stopping' || this.state === 'completed') return;
    this.state = 'stopping';
    uIOhook.stop();
    this.state = 'completed';
    for (const cb of this.disconnectCallbacks) {
      cb();
    }
  }

  public async pause(): Promise<void> {
    this.state = 'paused';
  }

  public async resume(): Promise<void> {
    this.state = 'recording';
  }

  public onEvent(callback: (event: RawEvent) => void): void {
    this.callbacks.push(callback);
  }

  public onDisconnected(callback: () => void): void {
    this.disconnectCallbacks.push(callback);
  }

  private async handleMouseClick(e: UiohookMouseEvent): Promise<void> {
    if (this.state !== 'recording') return;

    const event: RawEvent = {
      id: randomUUID(),
      type: 'mouse',
      action: 'click',
      x: e.x,
      y: e.y,
      timestamp: Date.now(),
      metadata: { confidence: 1, monitor: 1 }
    };
    
    this.emitEvent(event);
  }

  private async handleKeyDown(e: UiohookKeyboardEvent): Promise<void> {
    if (this.state !== 'recording') return;

    let keyStr = String.fromCharCode(e.keycode);
    if (e.keycode === UiohookKey.Enter) keyStr = 'Enter';
    else if (e.keycode === UiohookKey.Backspace) keyStr = 'Backspace';
    else if (e.keycode === UiohookKey.Tab) keyStr = 'Tab';

    const event: RawEvent = {
      id: randomUUID(),
      type: 'keyboard',
      action: 'keydown',
      key: keyStr,
      timestamp: Date.now(),
      metadata: { confidence: 1, monitor: 1 }
    };

    this.emitEvent(event);
  }

  private emitEvent(event: RawEvent) {
    for (const cb of this.callbacks) {
      cb(event);
    }
  }
}
