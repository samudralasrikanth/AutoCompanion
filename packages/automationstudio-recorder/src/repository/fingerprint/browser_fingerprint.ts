import { FingerprintGenerator } from './fingerprint';
import { RepositoryObject } from '@automation-studio/types';

export class BrowserFingerprintV1 implements FingerprintGenerator {
  algorithm = 'browser-v1';

  generate(objectData: Partial<RepositoryObject>): string {
    const meta = objectData.metadata || {};
    // Identity attributes for browser: origin, frame, tag, stable attributes, role, accessible name
    const origin = meta.origin || '';
    const frame = meta.frame || '';
    const tag = meta.tag || '';
    const role = meta.role || '';
    const name = meta.accessibleName || objectData.name || '';
    
    return `browser-v1|${origin}|${frame}|${tag}|${role}|${name}`;
  }
}
