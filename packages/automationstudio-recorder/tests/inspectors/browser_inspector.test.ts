import { BrowserInspector, DOMElementReference } from '../../src/inspectors/browser_inspector';
import { beforeEach, describe, expect, test } from 'vitest';

describe('BrowserInspector', () => {
  let inspector: BrowserInspector;

  beforeEach(() => {
    inspector = new BrowserInspector();
  });

  test('should inspect DOM element and extract properties and candidates', async () => {
    const target: DOMElementReference = {
      id: 'login-btn',
      tagName: 'button',
      attributes: {
        'data-testid': 'submit-button',
        'class': 'btn btn-primary'
      },
      text: 'Login',
      roles: ['button'],
      aria: {
        'aria-label': 'Submit login'
      },
      frameContext: ['iframe-1'],
      shadowContext: []
    };

    const result = await inspector.inspect(target);

    expect(result.source).toBe('browser');
    expect(result.target).toBe(target);
    expect(result.properties).toMatchObject({
      attributes: target.attributes,
      roles: ['button'],
      text: 'Login',
      aria: target.aria,
      frameContext: ['iframe-1']
    });

    // Check extracted candidates
    expect(result.locatorCandidates).toHaveLength(5); // testid, id, role, text, css fallback

    const testIdCandidate = result.locatorCandidates.find(c => c.strategy === 'testId');
    expect(testIdCandidate).toBeDefined();
    expect(testIdCandidate!.value).toBe('submit-button');
    expect(testIdCandidate!.metadata.framePath).toEqual(['iframe-1']);

    const textCandidate = result.locatorCandidates.find(c => c.strategy === 'text');
    expect(textCandidate).toBeDefined();
    expect(textCandidate!.value).toBe('Login');

    const idCandidate = result.locatorCandidates.find(c => c.strategy === 'css' && c.value === '#login-btn');
    expect(idCandidate).toBeDefined();
  });
});
