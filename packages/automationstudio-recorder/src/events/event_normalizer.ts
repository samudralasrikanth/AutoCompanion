import { RawRecorderEvent } from './raw_event';
import { NormalizedEvent } from './normalized_event';

export type NormalizedEventCallback = (event: NormalizedEvent) => void;

export class EventNormalizer {
  private keyBuffer: string[] = [];
  private keyBufferTimer: NodeJS.Timeout | null = null;
  private lastMousedownEvent: RawRecorderEvent | null = null;
  private mousedownTimer: NodeJS.Timeout | null = null;

  private onNormalizedEvent: NormalizedEventCallback;

  constructor(callback: NormalizedEventCallback) {
    this.onNormalizedEvent = callback;
  }

  process(event: RawRecorderEvent): void {
    const type = event.type.toLowerCase();
    
    // Ignore pure mouse moves for simple recording unless specifically requested,
    // but the instruction implies filtering them.
    if (type === 'mousemove') {
      return;
    }

    if (type === 'mousedown') {
      this.lastMousedownEvent = event;
      if (this.mousedownTimer) {
        clearTimeout(this.mousedownTimer);
      }
      this.mousedownTimer = setTimeout(() => {
        // If no mouseup within 500ms, it's just a mousedown (or drag start)
        this.emitMousedown();
      }, 500);
      return;
    }

    if (type === 'mouseup') {
      if (this.lastMousedownEvent && this.mousedownTimer) {
        // We have a mousedown followed quickly by mouseup -> click
        clearTimeout(this.mousedownTimer);
        this.lastMousedownEvent = null;
        this.mousedownTimer = null;
        
        this.emitNormalized({
          type: 'click',
          timestamp: event.timestamp,
          target: this.extractTarget(event),
          coordinates: this.extractCoordinates(event)
        });
        return;
      } else {
        // Ignore orphan mouseup
        return;
      }
    }

    if (type === 'keydown') {
      const payload = event.payload as any;
      if (payload && payload.key && payload.key.length === 1) {
        this.keyBuffer.push(payload.key);
        
        if (this.keyBufferTimer) {
          clearTimeout(this.keyBufferTimer);
        }
        
        this.keyBufferTimer = setTimeout(() => {
          this.flushKeyBuffer(event.timestamp, this.extractTarget(event));
        }, 300);
        return;
      } else {
        // Flush buffer if a special key is pressed
        this.flushKeyBuffer(event.timestamp, this.extractTarget(event));
        this.emitNormalized({
          type: 'keypress',
          timestamp: event.timestamp,
          target: this.extractTarget(event),
          value: payload?.key
        });
        return;
      }
    }
    
    // Unrecognized or other direct events pass through (or are dropped)
    // For now we just pass them through with their type
    this.flushKeyBuffer(event.timestamp, this.extractTarget(event));
    this.emitNormalized({
      type: type,
      timestamp: event.timestamp,
      target: this.extractTarget(event)
    });
  }

  private emitMousedown(): void {
    if (this.lastMousedownEvent) {
      this.emitNormalized({
        type: 'mousedown',
        timestamp: this.lastMousedownEvent.timestamp,
        target: this.extractTarget(this.lastMousedownEvent),
        coordinates: this.extractCoordinates(this.lastMousedownEvent)
      });
      this.lastMousedownEvent = null;
      this.mousedownTimer = null;
    }
  }

  private flushKeyBuffer(timestamp: string, target: any): void {
    if (this.keyBuffer.length > 0) {
      const typedText = this.keyBuffer.join('');
      this.emitNormalized({
        type: 'type',
        timestamp: timestamp,
        target: target,
        value: typedText
      });
      this.keyBuffer = [];
      if (this.keyBufferTimer) {
        clearTimeout(this.keyBufferTimer);
        this.keyBufferTimer = null;
      }
    }
  }

  private emitNormalized(event: NormalizedEvent): void {
    this.onNormalizedEvent(event);
  }

  private extractTarget(event: RawRecorderEvent): any {
    const payload = event.payload as any;
    if (payload && payload.target) {
      return payload.target;
    }
    return undefined;
  }

  private extractCoordinates(event: RawRecorderEvent): any {
    const payload = event.payload as any;
    if (payload && typeof payload.x === 'number' && typeof payload.y === 'number') {
      return { x: payload.x, y: payload.y };
    }
    return undefined;
  }
}
