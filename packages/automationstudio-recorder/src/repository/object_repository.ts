import { RepositoryObject, LocatorCandidate, RepositoryDocument } from '@automation-studio/types';
import { ObjectMatcher, MatchConfidence } from './object_matcher';
import { LocatorRanker } from './locator_ranker';

export class ObjectRepository {
  private objects: Map<string, RepositoryObject> = new Map();

  constructor(
    private matcher: ObjectMatcher,
    private ranker: LocatorRanker
  ) {}

  add(objectData: Partial<RepositoryObject>): RepositoryObject {
    const fingerprints = this.matcher.generateFingerprints(objectData);
    
    // Check for exact match deduplication
    for (const existingObj of this.objects.values()) {
      const match = this.matcher.evaluateMatch(existingObj, objectData);
      if (match === MatchConfidence.EXACT) {
        return this.merge(existingObj, objectData);
      }
    }

    // No match, create new
    const now = new Date().toISOString();
    const newObj: RepositoryObject = {
      id: objectData.id || `obj-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      name: objectData.name || 'Unknown Object',
      type: objectData.type || 'unknown',
      source: objectData.source || 'unknown',
      locators: this.ranker.rank(this.deepCopy(objectData.locators || [])),
      fingerprints,
      metadata: this.deepCopy(objectData.metadata || {}),
      createdAt: now,
      updatedAt: now
    };

    if (newObj.locators.length > 0) {
      newObj.preferredLocatorId = newObj.locators[0].id;
    }

    this.objects.set(newObj.id, newObj);
    // Return a safe copy
    return this.deepCopy(newObj);
  }

  private merge(existing: RepositoryObject, newData: Partial<RepositoryObject>): RepositoryObject {
    // Preserve identity, merge locators
    const newLocators = newData.locators || [];
    const mergedLocators = [...existing.locators];

    for (const newLoc of newLocators) {
      const existingLocIndex = mergedLocators.findIndex(l => l.strategy === newLoc.strategy && l.value === newLoc.value);
      if (existingLocIndex >= 0) {
        // Update existing locator (merge metadata, observations)
        const eLoc = mergedLocators[existingLocIndex];
        mergedLocators[existingLocIndex] = {
          ...eLoc,
          score: Math.max(eLoc.score, newLoc.score),
          confidence: Math.max(eLoc.confidence, newLoc.confidence),
          metadata: { ...eLoc.metadata, ...newLoc.metadata },
          observations: [...(eLoc.observations || []), ...(newLoc.observations || [])]
        };
      } else {
        mergedLocators.push({ ...newLoc });
      }
    }

    const rankedLocators = this.ranker.rank(mergedLocators);
    const preferredLocatorId = rankedLocators.length > 0 ? rankedLocators[0].id : undefined;

    const mergedObj: RepositoryObject = {
      ...existing,
      locators: rankedLocators,
      preferredLocatorId,
      metadata: { ...existing.metadata, ...newData.metadata },
      updatedAt: new Date().toISOString()
    };

    this.objects.set(mergedObj.id, mergedObj);
    return this.deepCopy(mergedObj);
  }

  update(id: string, updateData: Partial<RepositoryObject>): RepositoryObject {
    const existing = this.objects.get(id);
    if (!existing) {
      throw new Error(`Object with id ${id} not found`);
    }

    const updated = {
      ...existing,
      ...this.deepCopy(updateData),
      id: existing.id, // never overwrite id
      createdAt: existing.createdAt, // never overwrite createdAt
      updatedAt: new Date().toISOString()
    };

    this.objects.set(id, updated);
    return this.deepCopy(updated);
  }

  remove(id: string): boolean {
    return this.objects.delete(id);
  }

  resolveObject(id: string): RepositoryObject | undefined {
    const obj = this.objects.get(id);
    return obj ? this.deepCopy(obj) : undefined;
  }

  contains(id: string): boolean {
    return this.objects.has(id);
  }

  list(): RepositoryObject[] {
    return Array.from(this.objects.values()).map(o => this.deepCopy(o));
  }

  find(predicate: (obj: RepositoryObject) => boolean): RepositoryObject[] {
    return this.list().filter(predicate);
  }

  clear(): void {
    this.objects.clear();
  }

  private deepCopy<T>(obj: T): T {
    return JSON.parse(JSON.stringify(obj));
  }
}
