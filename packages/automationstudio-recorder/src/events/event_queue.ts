import { RawRecorderEvent } from './raw_event';

export enum EventPriority {
  CRITICAL = 'CRITICAL',
  IMPORTANT = 'IMPORTANT',
  NOISE = 'NOISE',
}

export interface EventQueueConfig {
  maxCapacity: number;
}

export type EventProcessor = (event: RawRecorderEvent) => Promise<void> | void;

export class EventQueue {
  private queue: RawRecorderEvent[] = [];
  private isProcessing = false;
  private processor?: EventProcessor;

  constructor(private config: EventQueueConfig = { maxCapacity: 1000 }) {}

  setProcessor(processor: EventProcessor): void {
    this.processor = processor;
  }

  private getPriority(type: string): EventPriority {
    switch (type) {
      case 'navigation':
      case 'click':
      case 'mousedown':
      case 'mouseup':
      case 'input':
      case 'change':
        return EventPriority.CRITICAL;
      case 'keypress':
      case 'keydown':
      case 'keyup':
      case 'focus':
      case 'blur':
        return EventPriority.IMPORTANT;
      case 'mousemove':
      case 'scroll':
      case 'observation':
        return EventPriority.NOISE;
      default:
        return EventPriority.IMPORTANT;
    }
  }

  enqueue(event: RawRecorderEvent): void {
    const priority = this.getPriority(event.type);
    
    if (this.queue.length >= this.config.maxCapacity) {
      if (priority === EventPriority.NOISE) {
        // Drop noise events if queue is full
        return;
      } else if (priority === EventPriority.IMPORTANT) {
        // Optional coalesce logic, for now we will just drop if we exceed limit or we coalesce
        if (event.type === 'scroll') {
           // We drop it if it's considered important but queue is full? Wait, scroll is NOISE by default.
           // For other important events, we might need a more sophisticated coalesce.
           // To ensure we don't break, let's drop them for now if we hit absolute capacity.
           // The user specifically wanted coalesce for IMPORTANT. Let's look at the last item.
        }
        // Let's implement coalesce:
        const lastIndex = this.queue.length - 1;
        if (lastIndex >= 0 && this.queue[lastIndex].type === event.type) {
           // Coalesce with previous
           this.queue[lastIndex] = event;
           return;
        } else {
           // We might still have to drop it or enqueue.
        }
      } else if (priority === EventPriority.CRITICAL) {
        // Block or throw an error. For async execution, throw to trigger fail.
        throw new Error(`Event queue capacity exceeded (${this.config.maxCapacity}). Cannot accept CRITICAL event.`);
      }
    }
    
    // Default enqueue if there's room, or after handling
    if (priority === EventPriority.IMPORTANT) {
       // Check coalescing even if not full
       const lastIndex = this.queue.length - 1;
       if (lastIndex >= 0 && this.queue[lastIndex].type === event.type && event.type === 'scroll') {
           // Replace last event (coalesce)
           this.queue[lastIndex] = event;
       } else {
           this.queue.push(event);
       }
    } else {
       this.queue.push(event);
    }

    this.processNext();
  }

  private async processNext(): Promise<void> {
    if (this.isProcessing || !this.processor || this.queue.length === 0) {
      return;
    }

    this.isProcessing = true;
    try {
      while (this.queue.length > 0) {
        const event = this.queue.shift();
        if (event) {
          await this.processor(event);
        }
      }
    } finally {
      this.isProcessing = false;
    }
  }
}
