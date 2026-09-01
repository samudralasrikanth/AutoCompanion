export interface NativeBrowserEvent {
  type: string;
  payload: any;
  targetElement?: any; // Represents the native DOM element or mock equivalent
}

export type NativeEventHandler = (event: NativeBrowserEvent) => void;

/**
 * Knows how events are captured from the browser.
 */
export interface BrowserEventSource {
  onNativeEvent(handler: NativeEventHandler): void;
  startListening(): Promise<void>;
  stopListening(): Promise<void>;
  dispose(): Promise<void>;
}
