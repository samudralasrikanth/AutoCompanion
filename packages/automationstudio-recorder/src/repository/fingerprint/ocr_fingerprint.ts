import { FingerprintGenerator } from './fingerprint';
import { RepositoryObject } from '@automation-studio/types';

export class OcrFingerprintV1 implements FingerprintGenerator {
  algorithm = 'ocr-v1';

  generate(objectData: Partial<RepositoryObject>): string {
    const meta = objectData.metadata || {};
    const text = meta.text || objectData.name || '';
    const screenContext = meta.screenContext || '';
    const region: any = meta.region;
    const regionStr = region ? `${region.x},${region.y},${region.width},${region.height}` : '';
    
    return `ocr-v1|${text}|${regionStr}|${screenContext}`;
  }
}
