export interface RawRecorderEvent {
  eventId: string;
  sessionId: string;
  executionId?: string;
  correlationId?: string;
  sequenceNumber: number;
  source: "browser" | "desktop" | "ocr" | "vision" | "citrix";
  timestamp: string;
  type: string;
  payload: unknown;
  interactionTarget?: {
    elementId: string;
    framePath: string[];
    snapshotRef?: string;
  };
}
