import { uIOhook, UiohookKey } from 'uiohook-napi';
import { randomUUID } from 'crypto';
import type { RecorderState, SemanticAction } from '@automation-studio/recorder';

export class VisionRecordSession {
  public readonly sessionId = randomUUID();
  private callbacks: ((action: SemanticAction) => void)[] = [];
  private state: RecorderState = 'idle';

  public getState(): RecorderState {
    return this.state;
  }

  public async start(): Promise<void> {
    if (this.state === 'recording') return;
    this.state = 'recording';
    uIOhook.on('click', this.handleMouseClick.bind(this));
    uIOhook.on('keydown', this.handleKeyDown.bind(this));
    uIOhook.start();
  }

  public async stop(): Promise<void> {
    if (this.state !== 'recording' && this.state !== 'paused') return;
    this.state = 'stopping';
    uIOhook.stop();
    this.state = 'completed';
  }

  public async pause(): Promise<void> {
    this.state = 'paused';
  }

  public async resume(): Promise<void> {
    this.state = 'recording';
  }

  public onAction(callback: (action: SemanticAction) => void): void {
    this.callbacks.push(callback);
  }

  public onDisconnected(_callback: () => void): void {
    // In-process recorder; no disconnect events unless stopped externally.
  }

  private async handleMouseClick(e: { x: number; y: number }): Promise<void> {
    if (this.state !== 'recording') return;
    this.emitAction({
      id: randomUUID(),
      action: 'click',
      parameters: { x: e.x, y: e.y },
      timestamp: Date.now(),
      metadata: { confidence: 1, monitor: 1 },
    });
  }

  private async handleKeyDown(e: { keycode: number }): Promise<void> {
    if (this.state !== 'recording') return;
    let keyStr = String.fromCharCode(e.keycode);
    if (e.keycode === UiohookKey.Enter) keyStr = 'Enter';
    else if (e.keycode === UiohookKey.Backspace) keyStr = 'Backspace';
    else if (e.keycode === UiohookKey.Tab) keyStr = 'Tab';

    this.emitAction({
      id: randomUUID(),
      action: 'type',
      parameters: { text: keyStr },
      timestamp: Date.now(),
      metadata: { confidence: 1, monitor: 1 },
    });
  }

  private emitAction(action: SemanticAction): void {
    for (const cb of this.callbacks) {
      cb(action);
    }
  }
}
