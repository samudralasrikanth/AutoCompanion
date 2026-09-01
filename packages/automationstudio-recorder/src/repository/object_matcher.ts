import { RepositoryObject, ObjectFingerprint } from '@automation-studio/types';
import { FingerprintGenerator } from './fingerprint/fingerprint';
import { BrowserFingerprintV1 } from './fingerprint/browser_fingerprint';
import { DesktopFingerprintV1 } from './fingerprint/desktop_fingerprint';
import { OcrFingerprintV1 } from './fingerprint/ocr_fingerprint';
import { VisionFingerprintV1 } from './fingerprint/vision_fingerprint';

export enum MatchConfidence {
  EXACT = 'EXACT',
  HIGH = 'HIGH',
  MEDIUM = 'MEDIUM',
  LOW = 'LOW',
  NO_MATCH = 'NO_MATCH'
}

export class ObjectMatcher {
  private generators: Map<string, FingerprintGenerator> = new Map();

  constructor() {
    this.registerGenerator(new BrowserFingerprintV1());
    this.registerGenerator(new DesktopFingerprintV1());
    this.registerGenerator(new OcrFingerprintV1());
    this.registerGenerator(new VisionFingerprintV1());
  }

  registerGenerator(generator: FingerprintGenerator) {
    this.generators.set(generator.algorithm, generator);
  }

  generateFingerprints(objectData: Partial<RepositoryObject>): ObjectFingerprint[] {
    const source = objectData.source?.toLowerCase() || '';
    const prints: ObjectFingerprint[] = [];
    let algorithm = '';

    if (source === 'browser') {
      algorithm = 'browser-v1';
    } else if (source === 'desktop') {
      algorithm = 'desktop-v1';
    } else if (source === 'ocr') {
      algorithm = 'ocr-v1';
    } else if (source === 'vision') {
      algorithm = 'vision-v1';
    }

    if (algorithm && this.generators.has(algorithm)) {
      const generator = this.generators.get(algorithm)!;
      prints.push({
        fingerprintAlgorithm: algorithm,
        fingerprint: generator.generate(objectData)
      });
    }

    return prints;
  }

  evaluateMatch(obj1: RepositoryObject, obj2: Partial<RepositoryObject>): MatchConfidence {
    const prints1 = obj1.fingerprints || [];
    const prints2 = this.generateFingerprints(obj2);

    for (const p1 of prints1) {
      for (const p2 of prints2) {
        console.log(`p1: ${p1.fingerprintAlgorithm} = ${p1.fingerprint}`);
        console.log(`p2: ${p2.fingerprintAlgorithm} = ${p2.fingerprint}`);
        if (p1.fingerprintAlgorithm === p2.fingerprintAlgorithm && p1.fingerprint === p2.fingerprint) {
          return MatchConfidence.EXACT;
        }
      }
    }

    return MatchConfidence.NO_MATCH;
  }
}
