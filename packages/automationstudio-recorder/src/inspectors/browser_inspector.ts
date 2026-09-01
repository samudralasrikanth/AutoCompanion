import { InspectionResult, LocatorCandidate } from '@automation-studio/types';
import { PlatformInspector } from './inspector_contract';

export interface DOMElementReference {
  id: string;
  tagName: string;
  attributes: Record<string, string>;
  text: string;
  roles?: string[];
  aria?: Record<string, string>;
  frameContext: string[];
  shadowContext: string[];
  boundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  [k: string]: unknown;
}

export class BrowserInspector implements PlatformInspector {
  readonly source = 'browser';

  async inspect(target: unknown, options?: unknown): Promise<InspectionResult> {
    const el = target as DOMElementReference;

    // Default basic confidence
    const confidence = {
      score: 1.0,
      model: 'heuristic',
      factors: {
        attributesPresent: 1.0
      }
    };

    const locatorCandidates: LocatorCandidate[] = [];

    // Extract TestID
    const testId = el.attributes['data-testid'] || el.attributes['data-test-id'];
    if (testId) {
      locatorCandidates.push({
        id: `loc-testid-${Date.now()}`,
        strategy: 'testId',
        value: testId,
        score: 100,
        confidence: 1.0,
        stability: 'high',
        priority: 10,
        source: this.source,
        metadata: { framePath: el.frameContext }
      });
    }

    // Extract ID
    if (el.id) {
      locatorCandidates.push({
        id: `loc-id-${Date.now()}`,
        strategy: 'css',
        value: `#${el.id}`,
        score: 90,
        confidence: 0.9,
        stability: 'high',
        priority: 20,
        source: this.source,
        metadata: { framePath: el.frameContext }
      });
    }

    // Extract Role
    if (el.roles && el.roles.length > 0) {
      locatorCandidates.push({
        id: `loc-role-${Date.now()}`,
        strategy: 'role',
        value: el.roles[0],
        score: 80,
        confidence: 0.8,
        stability: 'high',
        priority: 30,
        source: this.source,
        metadata: { framePath: el.frameContext }
      });
    }

    // Extract Text
    if (el.text && el.text.trim() !== '') {
      locatorCandidates.push({
        id: `loc-text-${Date.now()}`,
        strategy: 'text',
        value: el.text.trim(),
        score: 60,
        confidence: 0.6,
        stability: 'medium',
        priority: 50,
        source: this.source,
        metadata: { framePath: el.frameContext }
      });
    }

    // Fallback tag CSS
    locatorCandidates.push({
      id: `loc-css-${Date.now()}`,
      strategy: 'css',
      value: el.tagName.toLowerCase(),
      score: 30,
      confidence: 0.3,
      stability: 'low',
      priority: 100,
      source: this.source,
      metadata: { framePath: el.frameContext }
    });

    return {
      id: `insp-${Date.now()}`,
      source: this.source,
      target: el,
      properties: {
        attributes: el.attributes,
        roles: el.roles || [],
        text: el.text,
        aria: el.aria || {},
        frameContext: el.frameContext,
        shadowContext: el.shadowContext
      },
      locatorCandidates,
      confidence,
      evidence: {
        boundingBox: el.boundingBox
      }
    };
  }
}
