import { LocatorCandidate, RepositoryObject } from '@automation-studio/types';

export enum ValidationResult {
  VALID = 'VALID',
  INVALID = 'INVALID',
  UNKNOWN = 'UNKNOWN'
}

export interface ObjectResolver {
  /**
   * Ask a platform implementation whether the locator currently resolves.
   */
  validateLocator(candidate: LocatorCandidate): Promise<ValidationResult>;

  /**
   * Attempt to locate the actual runtime object (returns platform-specific handle).
   */
  resolveLocator(object: RepositoryObject): Promise<any>;
}
