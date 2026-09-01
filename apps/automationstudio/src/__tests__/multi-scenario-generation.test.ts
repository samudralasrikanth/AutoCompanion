import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

describe('Multi-Scenario Flow Builder & Codegen', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'autocon-multiscenario-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  function generateGherkinMulti(
    featureTitle: string,
    scenarios: Array<{ name: string; steps: Array<{ type: string; label?: string; target?: string; value?: string }> }>,
    mode: 'pw' | 'surface' = 'pw'
  ): string {
    const lines = [`Feature: ${featureTitle}`, ''];
    for (const sc of scenarios) {
      lines.push(`  Scenario: ${sc.name}`);
      if (mode === 'surface') {
        lines.push('    Given the desktop application is ready');
      }
      sc.steps.forEach((s, idx) => {
        const t = s.target || s.label || 'the element';
        if (mode === 'surface') {
          if (s.type === 'launch') lines.push(`    When I launch the application`);
          else if (s.type === 'type') lines.push(`    And I type ${JSON.stringify(s.value || '')} into ${JSON.stringify(t)}`);
          else if (s.type === 'verify') lines.push(`    Then the screen shows ${JSON.stringify(t)}`);
          else lines.push(`    When I click the ${JSON.stringify(t)}`);
        } else {
          if (s.type === 'navigate') lines.push(`    Given I navigate to ${JSON.stringify(s.value || t)}`);
          else if (idx === 0) lines.push(`    Given the page is ready`);
          else if (s.type === 'type') lines.push(`    When I fill ${JSON.stringify(t)} with ${JSON.stringify(s.value || '')}`);
          else if (s.type === 'verify') lines.push(`    Then ${JSON.stringify(t)} is visible`);
          else lines.push(`    When I click ${JSON.stringify(t)}`);
        }
      });
      lines.push('');
    }
    return lines.join('\n');
  }

  function generatePlaywrightMulti(
    featureTitle: string,
    scenarios: Array<{ name: string; steps: Array<{ type: string; label?: string; target?: string; value?: string }> }>
  ): string {
    const lines = [
      `import { test, expect } from '@playwright/test';`,
      '',
      `test.describe(${JSON.stringify(featureTitle)}, () => {`,
    ];

    for (const sc of scenarios) {
      lines.push(`  test(${JSON.stringify(sc.name)}, async ({ page }) => {`);
      sc.steps.forEach((s) => {
        const target = JSON.stringify(s.target || s.label || '');
        if (s.type === 'navigate') lines.push(`    await page.goto(${JSON.stringify(s.value || s.target)});`);
        else if (s.type === 'type') lines.push(`    await page.locator(${target}).fill(${JSON.stringify(s.value || '')});`);
        else if (s.type === 'verify') lines.push(`    await expect(page.locator(${target})).toBeVisible();`);
        else lines.push(`    await page.locator(${target}).click();`);
      });
      lines.push(`  });`);
    }
    lines.push('});', '');
    return lines.join('\n');
  }

  it('generates a single Gherkin .feature file with multiple scenarios', () => {
    const scenarios = [
      {
        name: 'Scenario 1: Valid Login',
        steps: [
          { type: 'navigate', target: 'https://example.com/login', value: 'https://example.com/login' },
          { type: 'type', target: '#username', value: 'admin' },
          { type: 'type', target: '#password', value: 'secret' },
          { type: 'click', target: '#login-btn' },
          { type: 'verify', target: '#dashboard' },
        ],
      },
      {
        name: 'Scenario 2: Invalid Login Error',
        steps: [
          { type: 'navigate', target: 'https://example.com/login', value: 'https://example.com/login' },
          { type: 'type', target: '#username', value: 'invalid_user' },
          { type: 'type', target: '#password', value: 'wrong_pass' },
          { type: 'click', target: '#login-btn' },
          { type: 'verify', target: '#error-message' },
        ],
      },
    ];

    const gherkin = generateGherkinMulti('Authentication Workflow', scenarios, 'pw');

    expect(gherkin).toContain('Feature: Authentication Workflow');
    expect(gherkin).toContain('Scenario: Scenario 1: Valid Login');
    expect(gherkin).toContain('Given I navigate to "https://example.com/login"');
    expect(gherkin).toContain('When I fill "#username" with "admin"');
    expect(gherkin).toContain('Scenario: Scenario 2: Invalid Login Error');
    expect(gherkin).toContain('When I fill "#username" with "invalid_user"');
    expect(gherkin).toContain('Then "#error-message" is visible');
  });

  it('generates Playwright TypeScript with test.describe containing all scenarios', () => {
    const scenarios = [
      {
        name: 'Scenario 1: Checkout happy path',
        steps: [
          { type: 'navigate', target: 'https://store.example.com', value: 'https://store.example.com' },
          { type: 'click', target: '.add-to-cart' },
          { type: 'click', target: '#checkout' },
        ],
      },
      {
        name: 'Scenario 2: Apply discount code',
        steps: [
          { type: 'navigate', target: 'https://store.example.com/cart', value: 'https://store.example.com/cart' },
          { type: 'type', target: '#coupon-input', value: 'SAVE20' },
          { type: 'click', target: '#apply-coupon' },
          { type: 'verify', target: '.discount-applied' },
        ],
      },
    ];

    const tsCode = generatePlaywrightMulti('E-Commerce Purchase Suite', scenarios);

    expect(tsCode).toContain("test.describe(\"E-Commerce Purchase Suite\", () => {");
    expect(tsCode).toContain("test(\"Scenario 1: Checkout happy path\", async ({ page }) => {");
    expect(tsCode).toContain("await page.locator(\".add-to-cart\").click();");
    expect(tsCode).toContain("test(\"Scenario 2: Apply discount code\", async ({ page }) => {");
    expect(tsCode).toContain("await page.locator(\"#coupon-input\").fill(\"SAVE20\");");
    expect(tsCode).toContain("await expect(page.locator(\".discount-applied\")).toBeVisible();");
  });

  it('saves and reloads multi-scenario JSON spec schema', () => {
    const scriptDir = path.join(tempDir, 'automation', 'scenarios', 'auth-flow');
    fs.mkdirSync(scriptDir, { recursive: true });

    const specFile = path.join(scriptDir, 'spec.scenario.json');
    const multiScenarioData = {
      id: 'flow-auth-123',
      name: 'Authentication Flow',
      mode: 'playwright',
      metadata: {
        scenarios: [
          {
            id: 'sc-1',
            name: 'Scenario 1: Positive Login',
            nodes: [
              { id: 'start-1', type: 'start', label: 'Start' },
              {
                id: 'wf-1',
                type: 'workflow',
                label: 'Scenario 1: Positive Login',
                steps: [
                  { id: 'st-1', type: 'navigate', target: 'https://login.com', value: 'https://login.com' },
                  { id: 'st-2', type: 'click', target: '#submit' },
                ],
              },
              { id: 'end-1', type: 'end', label: 'End' },
            ],
          },
          {
            id: 'sc-2',
            name: 'Scenario 2: Locked Out User',
            nodes: [
              { id: 'start-2', type: 'start', label: 'Start' },
              {
                id: 'wf-2',
                type: 'workflow',
                label: 'Scenario 2: Locked Out User',
                steps: [
                  { id: 'st-3', type: 'type', target: '#username', value: 'locked_out_user' },
                  { id: 'st-4', type: 'verify', target: '.locked-warning' },
                ],
              },
              { id: 'end-2', type: 'end', label: 'End' },
            ],
          },
        ],
      },
    };

    fs.writeFileSync(specFile, JSON.stringify(multiScenarioData, null, 2), 'utf8');

    const loaded = JSON.parse(fs.readFileSync(specFile, 'utf8'));
    expect(loaded.metadata.scenarios).toHaveLength(2);
    expect(loaded.metadata.scenarios[0].name).toBe('Scenario 1: Positive Login');
    expect(loaded.metadata.scenarios[1].name).toBe('Scenario 2: Locked Out User');
    expect(loaded.metadata.scenarios[1].nodes[1].steps).toHaveLength(2);
  });

  it('generates Scenario Outline with Gherkin Examples table and Playwright data loop', () => {
    function generateGherkinWithOutline(
      featureTitle: string,
      scenarios: Array<{
        name: string;
        isOutline?: boolean;
        examples?: Array<Record<string, string>>;
        steps: Array<{ type: string; label?: string; target?: string; value?: string }>;
      }>
    ): string {
      const lines = [`Feature: ${featureTitle}`, ''];
      for (const sc of scenarios) {
        const isOutline = Boolean(sc.isOutline);
        const examples = Array.isArray(sc.examples) ? sc.examples : [];
        lines.push(`  ${isOutline ? 'Scenario Outline: ' : 'Scenario: '}${sc.name}`);
        sc.steps.forEach((s) => {
          const t = s.target || s.label || 'the element';
          if (s.type === 'navigate') lines.push(`    Given I navigate to ${JSON.stringify(s.value || t)}`);
          else if (s.type === 'type') lines.push(`    When I fill ${JSON.stringify(t)} with ${JSON.stringify(s.value || '')}`);
          else if (s.type === 'verify') lines.push(`    Then ${JSON.stringify(t)} is visible`);
          else lines.push(`    When I click ${JSON.stringify(t)}`);
        });
        if (isOutline && examples.length) {
          const headers = Object.keys(examples[0] || {});
          if (headers.length) {
            lines.push('');
            lines.push('    Examples:');
            lines.push(`      | ${headers.join(' | ')} |`);
            examples.forEach((row) => {
              lines.push(`      | ${headers.map((h) => String(row[h] || '')).join(' | ')} |`);
            });
          }
        }
        lines.push('');
      }
      return lines.join('\n');
    }

    const outlineScenarios = [
      {
        name: 'Data-driven User Login',
        isOutline: true,
        examples: [
          { username: 'student', password: 'secret://app.password', expected: '#loop-container' },
          { username: 'incorrectUser', password: 'Password123', expected: '#error' },
        ],
        steps: [
          { type: 'navigate', target: 'https://login.com', value: 'https://login.com' },
          { type: 'type', target: '#username', value: '<username>' },
          { type: 'type', target: '#password', value: '<password>' },
          { type: 'click', target: '#submit' },
          { type: 'verify', target: '<expected>' },
        ],
      },
    ];

    const gherkin = generateGherkinWithOutline('Login Outline Suite', outlineScenarios);
    expect(gherkin).toContain('Feature: Login Outline Suite');
    expect(gherkin).toContain('Scenario Outline: Data-driven User Login');
    expect(gherkin).toContain('Examples:');
    expect(gherkin).toContain('| username | password | expected |');
    expect(gherkin).toContain('| student | secret://app.password | #loop-container |');
    expect(gherkin).toContain('| incorrectUser | Password123 | #error |');
  });

  it('generates Playwright TypeScript with chosen browser channel configuration', () => {
    function generateWithBrowser(featureTitle: string, browserName: string): string {
      const browserConfig = browserName === 'msedge'
        ? "// Run tests in Microsoft Edge\ntest.use({ channel: 'msedge' });\n"
        : browserName === 'chrome'
        ? "// Run tests in Google Chrome\ntest.use({ channel: 'chrome' });\n"
        : "// Run tests in Chromium\ntest.use({ browserName: 'chromium' });\n";

      return [
        "import { test, expect } from '@playwright/test';",
        "",
        browserConfig + "test.describe(" + JSON.stringify(featureTitle) + ", () => {",
        "  test('Login test', async ({ page }) => {",
        "    await page.goto('https://example.com');",
        "  });",
        "});",
      ].join('\n');
    }

    const chromeCode = generateWithBrowser('Chrome Suite', 'chrome');
    expect(chromeCode).toContain("test.use({ channel: 'chrome' });");

    const edgeCode = generateWithBrowser('Edge Suite', 'msedge');
    expect(edgeCode).toContain("test.use({ channel: 'msedge' });");
  });
});


