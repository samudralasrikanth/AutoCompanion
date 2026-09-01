import { RepositoryObject } from '@automation-studio/types';

export interface FingerprintGenerator {
  algorithm: string;
  generate(objectData: Partial<RepositoryObject>): string;
}
