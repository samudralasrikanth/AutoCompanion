import type { IScenario, IStep } from '@automation-studio/sdk';
import type { IVisualObject } from '@automation-studio/sdk/src/repository/object-repository';
import { pyStr } from './generator-utils';

export class PythonGenerator {
  public static generatePython(scenario: IScenario, objects?: Record<string, IVisualObject>): string {
    const lines = [
      'from playwright.sync_api import sync_playwright, expect',
      '',
      'def run_scenario():',
      '    with sync_playwright() as p:',
      '        browser = p.chromium.launch(headless=False)',
      '        page = browser.new_page()',
      '        api_context = p.request.new_context()',
      '        api_response = None',
      ''
    ];

    for (const step of scenario.steps) {
      if (step.disabled) continue;
      
      let rawTarget = step.target || '';
      const obj = (objects && step.target) ? objects[step.target] : undefined;
      if (obj) {
        rawTarget = obj.definition.css || obj.definition.text || obj.definition.xpath || rawTarget;
      }
      const target = rawTarget ? pyStr(rawTarget) : '""';
      const param = (name: string) => step.parameters?.find(p => p.name === name)?.value || '';

      switch (step.type) {
        case 'click':
          lines.push(`        page.click(${target})`);
          break;
        case 'type':
          lines.push(`        page.fill(${target}, ${pyStr(param('value'))})`);
          break;
        case 'navigate':
          lines.push(`        page.goto(${pyStr(param('url'))})`);
          break;
        case 'rightClick':
          lines.push(`        page.click(${target}, button="right")`);
          break;
        case 'doubleClick':
          lines.push(`        page.dblclick(${target})`);
          break;
        case 'hover':
          lines.push(`        page.hover(${target})`);
          break;
        case 'select':
          lines.push(`        page.select_option(${target}, ${pyStr(param('value'))})`);
          break;
        case 'check':
          lines.push(`        page.check(${target})`);
          break;
        case 'uncheck':
          lines.push(`        page.uncheck(${target})`);
          break;
        case 'dragAndDrop':
          lines.push(`        page.drag_and_drop(${target}, ${pyStr(param('destination'))})`);
          break;
        case 'assertVisible':
          lines.push(`        expect(page.locator(${target})).to_be_visible()`);
          break;
        case 'assertText':
          lines.push(`        expect(page.locator(${target})).to_have_text(${pyStr(param('text'))})`);
          break;
        case 'waitNavigation':
          {
            const url = param('url');
            if (url) {
              lines.push(`        page.wait_for_url(${pyStr(url)})`);
            } else {
              lines.push(`        page.wait_for_load_state("load")`);
            }
          }
          break;
        case 'apiRequest':
          {
            const method = param('method') || 'GET';
            const url = param('url');
            const data = param('body');
            const headers = param('headers');
            lines.push(`        api_response = api_context.fetch(${pyStr(url)},`);
            lines.push(`            method=${pyStr(method)},`);
            if (headers) {
              lines.push(`            headers=${headers},`); // assumes headers is passed as valid json string dict
            }
            if (data) {
              lines.push(`            data=${data},`); // assumes data is valid json string dict
            }
            lines.push(`        )`);
          }
          break;
        case 'assertResponseStatus':
          lines.push(`        assert api_response.status == ${param('status')}`);
          break;
        case 'assertResponseBody':
          lines.push(`        assert api_response.json() == ${param('expectedValue')}`); // expectedValue should be valid json dict string
          break;
        default:
          lines.push(`        # Unknown step type: ${step.type}`);
      }
    }

    lines.push('');
    lines.push('        browser.close()');
    lines.push('');
    lines.push('if __name__ == "__main__":');
    lines.push('    run_scenario()');
    
    return lines.join('\n');
  }
}
