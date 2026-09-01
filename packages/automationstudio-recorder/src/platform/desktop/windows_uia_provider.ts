export interface UIAEvent {
  type: string;
  payload: any;
  targetElement?: any;
}

export type UIAEventHandler = (event: UIAEvent) => void;

export interface UIAElementSnapshot {
  automationId?: string;
  name?: string;
  className?: string;
  controlType?: string;
  frameworkId?: string;
  boundingRectangle?: { left: number; top: number; right: number; bottom: number };
}

/**
 * Knows how UIA information is obtained for a given target element.
 */
export interface WindowsUIAProvider {
  onUIAEvent(handler: UIAEventHandler): void;
  extractElement(targetElement: any): UIAElementSnapshot;
  startListening(): Promise<void>;
  stopListening(): Promise<void>;
  dispose(): Promise<void>;
}
