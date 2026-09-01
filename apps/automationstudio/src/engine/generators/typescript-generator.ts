import type { IScenario, IStep } from '@automation-studio/sdk';
import type { IVisualObject } from '@automation-studio/sdk/src/repository/object-repository';

/**
 * Escape a string for safe embedding inside a TypeScript single-quoted string literal.
 */
function tsStr(value: string): string {
  const escaped = value
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\r?\n/g, '\\n');
  return `'${escaped}'`;
}

export class TypescriptGenerator {
  public static generateTypescript(scenario: IScenario, objects?: Record<string, IVisualObject>): string {
    const lines = [
      "import { test, expect } from '@playwright/test';",
      '',
      `test(${tsStr(scenario.name || 'Automation Scenario')}, async ({ page, request }) => {`,
      `  let apiResponse: any;`
    ];

    for (const step of scenario.steps) {
      if (step.disabled) continue;
      
      let rawTarget = step.target || '';
      const obj = (objects && step.target) ? objects[step.target] : undefined;
      if (obj) {
        // Prefer css, then text, then xpath
        rawTarget = obj.definition.css || obj.definition.text || obj.definition.xpath || rawTarget;
      }
      const target = rawTarget ? tsStr(rawTarget) : "''";
      const param = (name: string) => step.parameters?.find(p => p.name === name)?.value || '';

      switch (step.type) {
        case 'click':
          lines.push(`  await page.click(${target});`);
          break;
        case 'type':
          lines.push(`  await page.fill(${target}, ${tsStr(param('value'))});`);
          break;
        case 'uploadFile':
          lines.push(`  await page.locator(${target}).setInputFiles(${tsStr(param('path') || param('value'))});`);
          break;
        case 'navigate':
          lines.push(`  await page.goto(${tsStr(param('url'))});`);
          break;
        case 'rightClick':
          lines.push(`  await page.click(${target}, { button: 'right' });`);
          break;
        case 'doubleClick':
          lines.push(`  await page.dblclick(${target});`);
          break;
        case 'hover':
          lines.push(`  await page.hover(${target});`);
          break;
        case 'select':
          lines.push(`  await page.selectOption(${target}, ${tsStr(param('value'))});`);
          break;
        case 'check':
          lines.push(`  await page.check(${target});`);
          break;
        case 'uncheck':
          lines.push(`  await page.uncheck(${target});`);
          break;
        case 'pressKey':
          lines.push(`  await page.locator(${target}).press(${tsStr(param('value') || 'Enter')});`);
          break;
        case 'assertValue':
          lines.push(`  await expect(page.locator(${target})).toHaveValue(${tsStr(param('value'))});`);
          break;
        case 'tableCount':
          lines.push(`  await expect(page.locator(${target})).toHaveCount(${Number(param('count') || 0)});`);
          break;
        case 'waitForElement':
          lines.push(`  await page.locator(${target}).waitFor({ state: 'visible' });`);
          break;
        case 'screenshot':
          lines.push(`  await page.screenshot({ path: ${tsStr(param('path') || 'artifacts/screenshot.png')}, fullPage: true });`);
          break;
        case 'dragAndDrop':
          lines.push(`  await page.dragAndDrop(${target}, ${tsStr(param('destination'))});`);
          break;
        case 'assertVisible':
          lines.push(`  await expect(page.locator(${target})).toBeVisible();`);
          break;
        case 'assertText':
          lines.push(`  await expect(page.locator(${target})).toHaveText(${tsStr(param('text'))});`);
          break;
        case 'waitNavigation':
          {
            const url = param('url');
            if (url) {
              lines.push(`  await page.waitForURL(${tsStr(url)});`);
            } else {
              lines.push(`  await page.waitForNavigation();`);
            }
          }
          break;
        case 'apiRequest':
          {
            const method = param('method') || 'GET';
            const url = param('url');
            const data = param('body');
            const headers = param('headers');
            lines.push(`  apiResponse = await request.fetch(${tsStr(url)}, {`);
            lines.push(`    method: ${tsStr(method)},`);
            if (headers) {
              lines.push(`    headers: ${headers},`); // assumes headers is passed as valid json string
            }
            if (data) {
              lines.push(`    data: ${data},`); // assumes data is valid json string
            }
            lines.push(`  });`);
          }
          break;
        case 'assertResponseStatus':
          lines.push(`  expect(apiResponse.status()).toBe(${param('status')});`);
          break;
        case 'assertResponseBody':
          lines.push(`  expect(await apiResponse.json()).toMatchObject(${param('expectedValue')});`); // expectedValue should be valid json
          break;
        default:
          lines.push(`  // Unknown step type: ${step.type}`);
      }
    }

    lines.push('});');
    lines.push('');
    
    return lines.join('\n');
  }
}
