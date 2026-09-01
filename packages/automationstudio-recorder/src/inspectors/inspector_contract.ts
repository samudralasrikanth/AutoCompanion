import { InspectionResult } from '@automation-studio/types';

export interface PlatformInspector {
  /**
   * Identifies the source platform for this inspector.
   */
  readonly source: 'browser' | 'desktop' | 'ocr' | 'vision';

  /**
   * Inspects a given target to produce a rich inspection result.
   *
   * @param target An opaque reference to the target element (e.g. DOM element, UIA element, Image, Screenshot).
   * @param options Optional configuration parameters for the inspection.
   * @returns A promise that resolves to the InspectionResult.
   */
  inspect(target: unknown, options?: unknown): Promise<InspectionResult>;
}
