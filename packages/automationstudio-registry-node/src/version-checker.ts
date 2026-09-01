export interface CompatibilityResult {
  compatible: boolean;
  reason?: string;
}

export class VersionChecker {
  /**
   * Extremely simple semver compatibility check.
   * E.g. required: ">=1.0.0", actual: "1.2.0"
   */
  public static isCompatible(required: string, actual: string): CompatibilityResult {
    if (!required || required === '*') return { compatible: true };
    
    // Simplistic check for demo purposes. 
    // In production, use `semver` npm package.
    if (required.startsWith('>=')) {
      const minVersion = required.replace('>=', '').trim();
      const isCompat = this.compareVersions(actual, minVersion) >= 0;
      return isCompat 
        ? { compatible: true } 
        : { compatible: false, reason: `Requires >= ${minVersion} but found ${actual}` };
    }

    if (required.startsWith('^')) {
      const majorRequired = required.replace('^', '').split('.')[0];
      const majorActual = actual.split('.')[0];
      const isCompat = majorRequired === majorActual;
      return isCompat 
        ? { compatible: true } 
        : { compatible: false, reason: `Requires major version ${majorRequired}.x but found ${actual}` };
    }
    
    const isCompat = required === actual;
    return isCompat 
      ? { compatible: true } 
      : { compatible: false, reason: `Requires exactly ${required} but found ${actual}` };
  }

  private static compareVersions(v1: string, v2: string): number {
    const p1 = v1.split('.').map(Number);
    const p2 = v2.split('.').map(Number);
    
    for (let i = 0; i < Math.max(p1.length, p2.length); i++) {
      const n1 = p1[i] || 0;
      const n2 = p2[i] || 0;
      if (n1 > n2) return 1;
      if (n1 < n2) return -1;
    }
    return 0;
  }
}
