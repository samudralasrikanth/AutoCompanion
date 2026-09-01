export interface NormalizedEvent {
  type: string; // e.g. 'click', 'type', 'hover', 'navigate'
  timestamp: string;
  target?: {
    objectId?: string;
    // other target details can be added later (e.g. element snapshot)
    snapshot?: Record<string, unknown>;
  };
  value?: unknown;
  coordinates?: {
    x: number;
    y: number;
  };
}
