import type { LocatorCandidate, ElementMetadata } from './interfaces';

export class LocatorEngine {
  public generateCandidates(metadata: ElementMetadata): LocatorCandidate[] {
    const candidates: LocatorCandidate[] = [];

    // 1. Data Test ID
    if (metadata.attributes['data-testid']) {
      candidates.push({ strategy: 'data-testid', value: metadata.attributes['data-testid'], confidence: 100, stability: 100, uniqueness: 100, recommended: true });
    }

    // 2. ID
    if (metadata.id) {
      candidates.push({ strategy: 'id', value: metadata.id, confidence: 95, stability: 90, uniqueness: 100 });
      candidates.push({ strategy: 'css', value: `#${metadata.id}`, confidence: 90, stability: 90, uniqueness: 100 });
    }

    // 3. Name
    if (metadata.name) {
      candidates.push({ strategy: 'name', value: metadata.name, confidence: 85, stability: 80, uniqueness: 90 });
    }

    // 4. Role
    if (metadata.role) {
      candidates.push({ strategy: 'role', value: metadata.role, confidence: 80, stability: 85, uniqueness: 50 });
    }

    // 5. Text
    if (metadata.text && metadata.text.trim().length > 0) {
      const escaped = metadata.text.trim().replace(/"/g, '\\"');
      candidates.push({ strategy: 'text', value: escaped, confidence: 75, stability: 70, uniqueness: 75 });
    }

    // 6. CSS (Classes)
    if (metadata.classes && metadata.classes.length > 0) {
      const classStr = metadata.classes.map(c => `.${c}`).join('');
      candidates.push({ strategy: 'css', value: `${metadata.tagName}${classStr}`, confidence: 60, stability: 50, uniqueness: 40 });
    }

    // 7. XPath
    if (metadata.xpath) {
      candidates.push({ strategy: 'xpath', value: metadata.xpath, confidence: 40, stability: 20, uniqueness: 100 });
    }

    // Fallback CSS
    if (candidates.length === 0 || !candidates.find(c => c.strategy === 'css')) {
      candidates.push({ strategy: 'css', value: metadata.tagName, confidence: 10, stability: 10, uniqueness: 10 });
    }

    return candidates.sort((a, b) => b.confidence - a.confidence);
  }
}
