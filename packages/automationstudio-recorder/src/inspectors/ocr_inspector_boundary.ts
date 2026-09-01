import { InspectionResult } from '@automation-studio/types';
import { PlatformInspector } from './inspector_contract';

export interface OCRReference {
  imageArtifact: string;
  region?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  [k: string]: unknown;
}

export class OCRInspectorBoundary implements PlatformInspector {
  readonly source = 'ocr';

  async inspect(target: unknown, options?: unknown): Promise<InspectionResult> {
    const ocrRef = target as OCRReference;

    // This is an architectural boundary. 
    // The actual OCR engine implementation will go here in EPIC-006.6.
    
    return {
      id: `insp-ocr-${Date.now()}`,
      source: this.source,
      target: ocrRef,
      properties: {
        rawText: '', 
        confidenceScores: {} 
      },
      locatorCandidates: [], // Engine will produce ocrText candidates
      confidence: {
        score: 0,
        model: 'ocr-pending'
      },
      evidence: {
        imageArtifact: ocrRef.imageArtifact,
        boundingBox: ocrRef.region
      }
    };
  }
}
