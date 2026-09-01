import { FingerprintGenerator } from './fingerprint';
import { RepositoryObject } from '@automation-studio/types';

export class VisionFingerprintV1 implements FingerprintGenerator {
  algorithm = 'vision-v1';

  generate(objectData: Partial<RepositoryObject>): string {
    const meta = objectData.metadata || {};
    const templateFingerprint = meta.templateFingerprint || '';
    const regionContext = meta.regionContext || '';
    
    return `vision-v1|${templateFingerprint}|${regionContext}`;
  }
}
