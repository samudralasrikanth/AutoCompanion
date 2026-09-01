export type ExecutionEventType = 
  | 'NodeStarted'
  | 'NodeFinished'
  | 'BreakpointHit'
  | 'RetryStarted'
  | 'RetryFinished'
  | 'VerificationFailed'
  | 'ScreenshotTaken'
  | 'Telemetry'
  | 'Log'
  | 'Warning'
  | 'Error';

export interface ExecutionEvent {
    type: ExecutionEventType;
    nodeId?: string;
    timestamp: number;
    payload?: any;
}

export type EventHandler = (event: ExecutionEvent) => void;

export class ExecutionBus {
    private handlers: Map<ExecutionEventType, EventHandler[]> = new Map();

    public subscribe(type: ExecutionEventType, handler: EventHandler): void {
        const list = this.handlers.get(type) || [];
        list.push(handler);
        this.handlers.set(type, list);
    }

    public emit(event: ExecutionEvent): void {
        const list = this.handlers.get(event.type);
        if (list) {
            for (const handler of list) {
                try { handler(event); } catch (e) { console.error('Error in handler', e); }
            }
        }
    }
}
