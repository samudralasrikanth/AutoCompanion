import type { Candidate, MatchResult } from './vision-types';
import type { VisionObjectHistory } from '../repository/vision-object-repository';

export interface IAIResolver {
  heal(candidates: Candidate[], screenshot: Buffer, history?: VisionObjectHistory): Promise<MatchResult>;
}
