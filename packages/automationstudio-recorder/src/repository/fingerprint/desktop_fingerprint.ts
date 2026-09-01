import { FingerprintGenerator } from './fingerprint';
import { RepositoryObject } from '@automation-studio/types';

export class DesktopFingerprintV1 implements FingerprintGenerator {
  algorithm = 'desktop-v1';

  generate(objectData: Partial<RepositoryObject>): string {
    const meta = objectData.metadata || {};
    const process = meta.process || '';
    const window = meta.window || '';
    const automationId = meta.automationId || '';
    const controlType = meta.controlType || '';
    const name = meta.name || objectData.name || '';
    
    return `desktop-v1|${process}|${window}|${automationId}|${controlType}|${name}`;
  }
}
