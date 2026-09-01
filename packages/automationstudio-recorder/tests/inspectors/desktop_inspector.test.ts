import { DesktopInspector, UIAReference } from '../../src/inspectors/desktop_inspector';
import { beforeEach, describe, expect, test } from 'vitest';

describe('DesktopInspector', () => {
  let inspector: DesktopInspector;

  beforeEach(() => {
    inspector = new DesktopInspector();
  });

  test('should inspect UIA element and extract properties and candidates', async () => {
    const target: UIAReference = {
      AutomationId: 'SubmitBtn',
      Name: 'Submit',
      ClassName: 'Button',
      ControlType: 'UIA_ButtonControlTypeId',
      FrameworkId: 'WPF'
    };

    const result = await inspector.inspect(target);

    expect(result.source).toBe('desktop');
    expect(result.target).toBe(target);
    expect(result.properties).toMatchObject({
      AutomationId: 'SubmitBtn',
      Name: 'Submit',
      ClassName: 'Button',
      ControlType: 'UIA_ButtonControlTypeId',
      FrameworkId: 'WPF'
    });

    // Check extracted candidates
    expect(result.locatorCandidates).toHaveLength(3); // AutomationId, Name, ClassName

    const autoIdCandidate = result.locatorCandidates.find(c => c.strategy === 'automationId');
    expect(autoIdCandidate).toBeDefined();
    expect(autoIdCandidate!.value).toBe('SubmitBtn');

    const nameCandidate = result.locatorCandidates.find(c => c.strategy === 'name');
    expect(nameCandidate).toBeDefined();
    expect(nameCandidate!.value).toBe('Submit');
  });
});
