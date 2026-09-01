import { ObjectRepository, ObjectMatcher, LocatorRanker, LocatorStrategyRegistry, RepositorySerializer } from '../../src/repository';
import { RepositoryObject, LocatorCandidate } from '@automation-studio/types';
import { beforeEach, describe, expect, test } from 'vitest';

describe('ObjectRepository', () => {
  let repository: ObjectRepository;
  let matcher: ObjectMatcher;
  let ranker: LocatorRanker;
  let registry: LocatorStrategyRegistry;
  let serializer: RepositorySerializer;

  beforeEach(() => {
    matcher = new ObjectMatcher();
    registry = new LocatorStrategyRegistry([
      { id: 'testId', priority: 10 },
      { id: 'role', priority: 20 },
      { id: 'css', priority: 30 },
      { id: 'xpath', priority: 40 }
    ]);
    ranker = new LocatorRanker(registry);
    repository = new ObjectRepository(matcher, ranker);
    serializer = new RepositorySerializer(matcher, ranker);
  });

  test('should merge matching objects and preserve identity', () => {
    // Add Object A
    const objA = repository.add({
      name: 'Submit Button',
      source: 'browser',
      metadata: { role: 'button', accessibleName: 'Submit' },
      locators: [
        {
          id: 'loc-1',
          strategy: 'testId',
          value: 'submit-btn',
          score: 0.9,
          confidence: 0.9,
          stability: 'high',
          priority: 10,
          source: 'browser',
          metadata: {}
        }
      ]
    });

    // Add Object B (matches fingerprint)
    const objB = repository.add({
      name: 'Submit Button',
      source: 'browser',
      metadata: { role: 'button', accessibleName: 'Submit' },
      locators: [
        {
          id: 'loc-2',
          strategy: 'role',
          value: 'button',
          score: 0.8,
          confidence: 0.8,
          stability: 'high',
          priority: 20,
          source: 'browser',
          metadata: {}
        }
      ]
    });

    // Should return the merged object, and only 1 object should be in repo
    expect(repository.list().length).toBe(1);
    expect(objB.id).toBe(objA.id); // Identity preserved
    expect(objB.locators.length).toBe(2);
    expect(objB.locators[0].strategy).toBe('testId'); // Ranked higher
    expect(objB.locators[1].strategy).toBe('role');
  });

  test('should handle collision: same name, different fingerprint', () => {
    repository.add({
      name: 'Submit Button',
      source: 'browser',
      metadata: { role: 'button', accessibleName: 'Submit1' }, // fingerprint A
      locators: []
    });

    repository.add({
      name: 'Submit Button',
      source: 'browser',
      metadata: { role: 'button', accessibleName: 'Submit2' }, // fingerprint B
      locators: []
    });

    expect(repository.list().length).toBe(2);
  });

  test('deterministic ranking across 1000 runs', () => {
    const candidates: LocatorCandidate[] = [
      { id: '4', strategy: 'xpath', value: 'a', score: 0.5, confidence: 0.5, stability: 'low', priority: 40, source: 'b', metadata: {} },
      { id: '3', strategy: 'css', value: 'a', score: 0.5, confidence: 0.5, stability: 'medium', priority: 30, source: 'b', metadata: {} },
      { id: '1', strategy: 'testId', value: 'a', score: 0.9, confidence: 0.9, stability: 'high', priority: 10, source: 'b', metadata: {} },
      { id: '2', strategy: 'role', value: 'a', score: 0.9, confidence: 0.9, stability: 'high', priority: 20, source: 'b', metadata: {} }
    ];

    const firstRun = ranker.rank([...candidates]).map(c => c.id).join(',');
    
    for (let i = 0; i < 1000; i++) {
      // Shuffle array
      const shuffled = [...candidates].sort(() => Math.random() - 0.5);
      const ranked = ranker.rank(shuffled).map(c => c.id).join(',');
      expect(ranked).toBe(firstRun);
    }
    
    expect(firstRun).toBe('1,2,3,4'); // Checks correct order
  });

  test('deep mutation safety', () => {
    const original: Partial<RepositoryObject> = {
      name: 'Test',
      locators: [
        {
          id: 'loc-1',
          strategy: 'css',
          value: '.test',
          score: 1,
          confidence: 1,
          stability: 'high',
          priority: 10,
          source: 'test',
          metadata: { key: 'value' }
        }
      ],
      metadata: { metaKey: 'metaValue' }
    };

    const added = repository.add(original);
    
    // Mutate caller's object
    original.name = 'Mutated';
    if (original.locators) original.locators[0].metadata.key = 'mutated';
    if (original.metadata) original.metadata.metaKey = 'mutated';

    // Mutate returned object
    added.name = 'Mutated2';
    added.locators[0].metadata.key = 'mutated2';
    added.metadata.metaKey = 'mutated2';

    const inRepo = repository.resolveObject(added.id)!;
    expect(inRepo.name).toBe('Test');
    expect(inRepo.locators[0].metadata.key).toBe('value');
    expect(inRepo.metadata.metaKey).toBe('metaValue');
  });

  test('persistence round-trip', () => {
    repository.add({ name: 'A', source: 'browser', metadata: { origin: 'http://a' }});
    repository.add({ name: 'B', source: 'browser', metadata: { origin: 'http://b' }});

    const doc = serializer.serialize(repository, 'repo-1', '1.0');
    expect(doc.objects.length).toBe(2);

    const newRepo = serializer.deserialize(doc);
    expect(newRepo.list().length).toBe(2);
    expect(newRepo.list()[0].name).toBe('A');
    expect(newRepo.list()[1].name).toBe('B');
  });
});
