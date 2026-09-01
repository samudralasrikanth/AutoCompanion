/**
 * Surface Generator tests.
 *
 * Validates that:
 * 1. Generated code contains SDK imports, not pyautogui
 * 2. Generated code has a workflow dict with correct step structure
 * 3. No one-off automate_* functions are generated
 * 4. Low-level code (SendInput, ctypes, locateCenterOnScreen) does NOT appear
 * 5. Verification steps generate verify entries in the workflow dict
 * 6. Disabled steps are excluded
 * 7. Playwright generators remain unchanged (regression)
 */
import { describe, it, expect } from 'vitest';
import { SurfaceGenerator, VisionGenerator } from '../engine/generators/vision-generator';
import { PythonGenerator } from '../engine/generators/python-generator';
import { TypescriptGenerator } from '../engine/generators/typescript-generator';
import type { IScenario } from '@automation-studio/sdk';

function makeScenario(overrides: Partial<IScenario> = {}): IScenario {
  return {
    id: 'test-001',
    name: 'Test Scenario',
    steps: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

describe('SurfaceGenerator', () => {
  describe('SDK-based output', () => {
    it('should import from automationstudio.sdk, not pyautogui', () => {
      const scenario = makeScenario({
        steps: [{ id: 's1', type: 'click', target: 'button.png' }],
      });
      const code = SurfaceGenerator.generatePython(scenario);

      expect(code).toContain('from automationstudio.sdk');
      expect(code).toContain('ExecutionPipeline');
      expect(code).toContain('WorkflowCompiler');
      expect(code).not.toContain('import pyautogui');
      expect(code).not.toContain('locateCenterOnScreen');
    });

    it('should generate a WORKFLOW dict with steps array', () => {
      const scenario = makeScenario({
        steps: [{ id: 's1', type: 'click', target: 'login_btn.png' }],
      });
      const code = SurfaceGenerator.generatePython(scenario);

      expect(code).toContain('WORKFLOW = {');
      expect(code).toContain('"steps": [');
      expect(code).toContain('"click"');
      expect(code).toContain('"login_btn.png"');
    });

    it('should not contain low-level OS code', () => {
      const scenario = makeScenario({
        steps: [
          { id: 's1', type: 'click', target: 'btn.png' },
          { id: 's2', type: 'type', parameters: [{ name: 'value', value: 'hello' }] },
        ],
      });
      const code = SurfaceGenerator.generatePython(scenario);

      // Must NOT contain any low-level code
      expect(code).not.toContain('SendInput');
      expect(code).not.toContain('ctypes');
      expect(code).not.toContain('EnumWindows');
      expect(code).not.toContain('locateCenterOnScreen');
      expect(code).not.toContain('pyautogui');
      expect(code).not.toContain('FAILSAFE');
    });

    it('should not generate one-off automate_ functions', () => {
      const scenario = makeScenario({
        steps: [
          { id: 's1', type: 'click', target: 'a.png' },
          { id: 's2', type: 'click', target: 'b.png' },
          { id: 's3', type: 'type', parameters: [{ name: 'value', value: 'test' }] },
        ],
      });
      const code = SurfaceGenerator.generatePython(scenario);

      expect(code).not.toMatch(/def automate_/);
      expect(code).not.toMatch(/def click_/);
      expect(code).not.toMatch(/def type_/);
    });
  });

  describe('step translation', () => {
    it('should translate click step with image target', () => {
      const scenario = makeScenario({
        steps: [{ id: 's1', type: 'click', target: 'submit.png' }],
      });
      const code = SurfaceGenerator.generatePython(scenario);

      expect(code).toContain('"click"');
      expect(code).toContain('"type": "image"');
      expect(code).toContain('"submit.png"');
    });

    it('should translate click step with text target as OCR', () => {
      const scenario = makeScenario({
        steps: [{ id: 's1', type: 'click', target: 'Submit Button' }],
      });
      const code = SurfaceGenerator.generatePython(scenario);

      expect(code).toContain('"click"');
      expect(code).toContain('"type": "ocr"');
      expect(code).toContain('"Submit Button"');
    });

    it('should translate type step', () => {
      const scenario = makeScenario({
        steps: [{ id: 's1', type: 'type', target: 'input.png', parameters: [{ name: 'value', value: 'admin' }] }],
      });
      const code = SurfaceGenerator.generatePython(scenario);

      expect(code).toContain('"type"');
      expect(code).toContain('"text": "admin"');
    });

    it('should translate assertVisible as verify', () => {
      const scenario = makeScenario({
        steps: [{ id: 's1', type: 'assertVisible', target: 'dashboard.png' }],
      });
      const code = SurfaceGenerator.generatePython(scenario);

      expect(code).toContain('"verify"');
      expect(code).toContain('"state": "exists"');
    });

    it('should translate assertText as verify with expected value', () => {
      const scenario = makeScenario({
        steps: [{ id: 's1', type: 'assertText', target: 'label.png', parameters: [{ name: 'text', value: 'Hello' }] }],
      });
      const code = SurfaceGenerator.generatePython(scenario);

      expect(code).toContain('"verify"');
      expect(code).toContain('"state": "text"');
      expect(code).toContain('"Hello"');
    });

    it('should translate doubleClick', () => {
      const scenario = makeScenario({
        steps: [{ id: 's1', type: 'doubleClick', target: 'icon.png' }],
      });
      const code = SurfaceGenerator.generatePython(scenario);

      expect(code).toContain('"click"');
      expect(code).toContain('"button": "double"');
    });

    it('should translate rightClick', () => {
      const scenario = makeScenario({
        steps: [{ id: 's1', type: 'rightClick', target: 'item.png' }],
      });
      const code = SurfaceGenerator.generatePython(scenario);

      expect(code).toContain('"click"');
      expect(code).toContain('"button": "right"');
    });
  });

  describe('disabled steps', () => {
    it('should exclude disabled steps from workflow', () => {
      const scenario = makeScenario({
        steps: [
          { id: 's1', type: 'click', target: 'a.png', disabled: false },
          { id: 's2', type: 'click', target: 'b.png', disabled: true },
          { id: 's3', type: 'click', target: 'c.png' },
        ],
      });
      const code = SurfaceGenerator.generatePython(scenario);

      expect(code).toContain('"a.png"');
      expect(code).not.toContain('"b.png"');
      expect(code).toContain('"c.png"');
    });
  });

  describe('lifecycle sections', () => {
    it('should include preconditions and assertions as labeled sections', () => {
      const scenario = makeScenario({
        preconditions: [{ id: 'p1', type: 'assertVisible', target: 'login.png' }],
        steps: [{ id: 's1', type: 'click', target: 'button.png' }],
        assertions: [{ id: 'a1', type: 'assertVisible', target: 'done.png' }],
      });
      const code = SurfaceGenerator.generatePython(scenario);

      expect(code).toContain('# --- preconditions ---');
      expect(code).toContain('# --- steps ---');
      expect(code).toContain('# --- assertions ---');
    });
  });

  describe('object repository resolution', () => {
    it('should resolve image targets from object repository', () => {
      const objects = {
        'obj-login': {
          id: 'obj-login',
          name: 'Login Button',
          definition: { image: { path: 'images/login_btn.png' } },
        },
      } as any;

      const scenario = makeScenario({
        steps: [{ id: 's1', type: 'click', target: 'obj-login' }],
      });
      const code = SurfaceGenerator.generatePython(scenario, objects);

      expect(code).toContain('"images/login_btn.png"');
      expect(code).not.toContain('"obj-login"');
    });
  });

  describe('pipeline structure', () => {
    it('should include all pipeline stages', () => {
      const scenario = makeScenario({
        steps: [{ id: 's1', type: 'click', target: 'btn.png' }],
      });
      const code = SurfaceGenerator.generatePython(scenario);

      expect(code).toContain('StateValidationStage');
      expect(code).toContain('CommandTranslationStage');
      expect(code).toContain('IdentificationStage');
      expect(code).toContain('AdapterStage');
      expect(code).toContain('VerificationStage');
      expect(code).toContain('RecoveryStage');
      expect(code).toContain('AuditStage');
    });

    it('should include execution result reporting', () => {
      const scenario = makeScenario({
        steps: [{ id: 's1', type: 'click', target: 'btn.png' }],
      });
      const code = SurfaceGenerator.generatePython(scenario);

      expect(code).toContain('result.status');
      expect(code).toContain('result.steps');
    });
  });

  describe('Surface evidence', () => {
    it('should emit deterministic ordered locator candidates and a shared runtime call', () => {
      const scenario = makeScenario({
        steps: [{
          id: 's1',
          type: 'click',
          target: 'login',
          surface: {
            locators: [
              { strategy: 'coordinate', value: { x: 10, y: 20 } as any },
              { strategy: 'uia', value: 'LoginButton' },
            ],
          },
        }],
      });
      const code = SurfaceGenerator.generatePython(scenario);

      expect(code.indexOf('"uia"')).toBeLessThan(code.indexOf('"coordinate"'));
      expect(code).toContain('run_surface_workflow(WORKFLOW');
      expect(code).not.toContain('create_default_adapter');
    });
  });

  describe('backward compatibility', () => {
    it('VisionGenerator should be an alias for SurfaceGenerator', () => {
      expect(VisionGenerator).toBe(SurfaceGenerator);
    });
  });
});

describe('Playwright Generator Regression', () => {
  it('PythonGenerator should still generate playwright code', () => {
    const scenario = makeScenario({
      steps: [
        { id: 's1', type: 'click', target: '#submit' },
        { id: 's2', type: 'navigate', parameters: [{ name: 'url', value: 'https://example.com' }] },
      ],
    });
    const code = PythonGenerator.generatePython(scenario);

    expect(code).toContain('from playwright.sync_api import sync_playwright');
    expect(code).toContain('page.click');
    expect(code).toContain('page.goto');
    // Must NOT contain SDK pipeline imports
    expect(code).not.toContain('ExecutionPipeline');
    expect(code).not.toContain('WorkflowCompiler');
  });

  it('TypescriptGenerator should still generate playwright code', () => {
    const scenario = makeScenario({
      steps: [
        { id: 's1', type: 'click', target: '#submit' },
        { id: 's2', type: 'assertVisible', target: '#result' },
      ],
    });
    const code = TypescriptGenerator.generateTypescript(scenario);

    expect(code).toContain("import { test, expect } from '@playwright/test'");
    expect(code).toContain('await page.click');
    expect(code).toContain('toBeVisible');
    // Must NOT contain SDK pipeline imports
    expect(code).not.toContain('ExecutionPipeline');
    expect(code).not.toContain('WorkflowCompiler');
  });
});
