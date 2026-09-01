import { BrowserInspector } from '../../src/inspectors/browser_inspector';
import { DesktopInspector } from '../../src/inspectors/desktop_inspector';
import { OCRInspectorBoundary } from '../../src/inspectors/ocr_inspector_boundary';
import { VisionInspectorBoundary } from '../../src/inspectors/vision_inspector_boundary';
import { InspectionResult } from '@automation-studio/types';
import { describe, expect, test } from 'vitest';

describe('Unified Inspection Contract', () => {
  test('all inspectors return a consistent InspectionResult without mutating an ObjectRepository', async () => {
    const browserInspector = new BrowserInspector();
    const desktopInspector = new DesktopInspector();
    const ocrInspector = new OCRInspectorBoundary();
    const visionInspector = new VisionInspectorBoundary();

    const results: InspectionResult[] = [];

    results.push(await browserInspector.inspect({
      tagName: 'div',
      attributes: {},
      frameContext: [],
      shadowContext: []
    }));

    results.push(await desktopInspector.inspect({
      AutomationId: 'test'
    }));

    results.push(await ocrInspector.inspect({
      imageArtifact: 'test.png'
    }));

    results.push(await visionInspector.inspect({
      imageArtifact: 'test.png'
    }));

    for (const result of results) {
      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('source');
      expect(result).toHaveProperty('target');
      expect(result).toHaveProperty('properties');
      expect(result).toHaveProperty('locatorCandidates');
      expect(result).toHaveProperty('confidence');
      
      // Ensure we haven't accidentally introduced a repository property
      // The inspector must not have direct references to ObjectRepository or any persistence mechanisms.
      expect((result as any).repository).toBeUndefined();
      expect((result.target as any).repository).toBeUndefined();
    }
  });
});
