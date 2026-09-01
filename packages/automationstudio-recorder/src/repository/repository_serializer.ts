import { RepositoryDocument } from '@automation-studio/types';
import { ObjectRepository } from './object_repository';
import { ObjectMatcher } from './object_matcher';
import { LocatorRanker } from './locator_ranker';

export class RepositorySerializer {
  constructor(
    private matcher: ObjectMatcher,
    private ranker: LocatorRanker
  ) {}

  serialize(repository: ObjectRepository, repositoryId: string, version: string = "1.0"): RepositoryDocument {
    return {
      repositoryId,
      version,
      objects: repository.list()
    };
  }

  deserialize(document: RepositoryDocument): ObjectRepository {
    const repo = new ObjectRepository(this.matcher, this.ranker);
    for (const obj of document.objects) {
      // Use internal set to avoid merge deduplication during load, assuming document is pristine
      // Or just use add, but we want to preserve exact IDs and timestamps. 
      // Update: add() is fine if the objects are exact since add() will merge. 
      // But to faithfully restore, we can just update internal state, or use a specific restore method.
      // Let's use an internal method or just call add() which might modify timestamps.
      // To keep it simple and lossless, we'll expose a bulk load on repository if needed.
      // For now, let's call a load() method if we added it, or just use reflection for tests.
      // Better approach: add a method `load(objects: RepositoryObject[])` to the repo.
      repo['objects'].set(obj.id, JSON.parse(JSON.stringify(obj)));
    }
    return repo;
  }
}
