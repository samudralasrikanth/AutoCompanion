export interface DOMSnapshot {
  elementId: string;
  framePath: string[];
  refId: string;
  attributes: Record<string, string>;
  boundingBox?: { x: number; y: number; width: number; height: number };
  url: string;
}

/**
 * Knows how DOM information is obtained for a given target element.
 */
export interface BrowserSnapshotProvider {
  /**
   * Captures a localized DOM snapshot for the given element.
   */
  captureSnapshot(targetElement: any): DOMSnapshot;
}
