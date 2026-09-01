import { RawRecorderEvent } from './raw_event';

export type EventCallback = (event: RawRecorderEvent) => void;

export class EventBus {
  private listeners: EventCallback[] = [];

  subscribe(callback: EventCallback): void {
    this.listeners.push(callback);
  }

  unsubscribe(callback: EventCallback): void {
    this.listeners = this.listeners.filter(cb => cb !== callback);
  }

  emit(event: RawRecorderEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err) {
        console.error('Error in event listener:', err);
      }
    }
  }
}
