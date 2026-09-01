import { InspectionResult, LocatorCandidate } from '@automation-studio/types';
import { PlatformInspector } from './inspector_contract';

export interface UIAReference {
  AutomationId?: string;
  Name?: string;
  ClassName?: string;
  ControlType?: string;
  FrameworkId?: string;
  BoundingRectangle?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  Parent?: string;
  Children?: string[];
  Patterns?: string[];
  [k: string]: unknown;
}

export class DesktopInspector implements PlatformInspector {
  readonly source = 'desktop';

  async inspect(target: unknown, options?: unknown): Promise<InspectionResult> {
    const uia = target as UIAReference;

    const confidence = {
      score: 1.0,
      model: 'heuristic',
      factors: {
        uiaPresent: 1.0
      }
    };

    const locatorCandidates: LocatorCandidate[] = [];

    if (uia.AutomationId) {
      locatorCandidates.push({
        id: `loc-uia-id-${Date.now()}`,
        strategy: 'automationId',
        value: uia.AutomationId,
        score: 100,
        confidence: 1.0,
        stability: 'high',
        priority: 10,
        source: this.source,
        metadata: {}
      });
    }

    if (uia.Name) {
      locatorCandidates.push({
        id: `loc-uia-name-${Date.now()}`,
        strategy: 'name',
        value: uia.Name,
        score: 80,
        confidence: 0.8,
        stability: 'high',
        priority: 20,
        source: this.source,
        metadata: {}
      });
    }

    if (uia.ClassName) {
      locatorCandidates.push({
        id: `loc-uia-class-${Date.now()}`,
        strategy: 'className',
        value: uia.ClassName,
        score: 50,
        confidence: 0.5,
        stability: 'medium',
        priority: 40,
        source: this.source,
        metadata: {}
      });
    }

    return {
      id: `insp-desktop-${Date.now()}`,
      source: this.source,
      target: uia,
      properties: {
        AutomationId: uia.AutomationId,
        Name: uia.Name,
        ClassName: uia.ClassName,
        ControlType: uia.ControlType,
        FrameworkId: uia.FrameworkId,
        Parent: uia.Parent,
        Children: uia.Children,
        Patterns: uia.Patterns
      },
      locatorCandidates,
      confidence,
      evidence: {
        boundingBox: uia.BoundingRectangle
      }
    };
  }
}
