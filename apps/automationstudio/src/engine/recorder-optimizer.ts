import type { ResolvedEvent, SemanticAction, PipelineResult } from '@automation-studio/recorder';
import { randomUUID } from 'crypto';

export class RecorderOptimizer {
  private buffer: ResolvedEvent[] = [];

  private surfaceMetadata(event: ResolvedEvent): Record<string, unknown> {
    const metadata = { ...event.metadata };
    const hasSurfaceEvidence = event.type === 'mouse' || event.type === 'vision' ||
      metadata['windowTitle'] || metadata['automationId'] || metadata['ocrText'] ||
      metadata['referenceImage'] || metadata['region'];
    if (hasSurfaceEvidence && (event.normalizedX !== undefined || event.x !== undefined)) {
      metadata['surfaceEvidence'] = [{
        strategy: 'coordinate',
        value: { x: event.normalizedX ?? event.x, y: event.normalizedY ?? event.y },
        scope: 'screen',
      }];
    }
    return metadata;
  }
  
  public optimize(event: ResolvedEvent): PipelineResult<SemanticAction[]> {
    const warnings: string[] = [];
    const errors: string[] = [];

    if (event.action === 'keydown') {
      this.buffer.push(event);
      return { data: [], errors, warnings };
    }
    
    const actionsToReturn: SemanticAction[] = [];
    
    if (this.buffer.length > 0) {
      const mergedAction = this.flushBuffer();
      if (mergedAction) actionsToReturn.push(mergedAction);
    }
    
    if (event.action === 'click') {
      actionsToReturn.push({
        id: randomUUID(),
        action: 'click',
        target: event.metadata?.['selector'] || event.targetName || event.targetElement || '',
        parameters: { x: event.normalizedX, y: event.normalizedY },
        timestamp: event.timestamp,
        metadata: this.surfaceMetadata(event)
      });
    }

    if (event.action === 'input') {
      actionsToReturn.push({
        id: randomUUID(),
        action: 'type',
        target: event.metadata?.['selector'] || '',
        parameters: { text: event.metadata?.['value'] || '' },
        timestamp: event.timestamp,
        metadata: this.surfaceMetadata(event)
      });
    }

    return { data: actionsToReturn, errors, warnings };
  }

  public flushBuffer(): SemanticAction | null {
    if (this.buffer.length === 0) return null;
    
    const firstEvent = this.buffer[0];
    const keys = this.buffer.map(e => e.key).filter(k => k && k.length === 1).join('');
    
    this.buffer = [];
    
    if (!keys || !firstEvent) return null;
    
    return {
      id: randomUUID(),
      action: 'type',
      target: firstEvent.targetName || firstEvent.targetElement || '',
      parameters: { text: keys },
      timestamp: firstEvent.timestamp,
      metadata: this.surfaceMetadata(firstEvent)
    };
  }
}
