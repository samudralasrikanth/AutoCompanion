import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { AutomationStudioAgentService } from '../agents/automation-studio-agent-service';

const cleanups: string[] = [];
afterEach(async () => {
  while (cleanups.length) await rm(cleanups.pop()!, { recursive: true, force: true });
});

describe('Automation Studio agent services', () => {
  it('builds a shared object preview from PW and Surface scenario evidence', async () => {
    const project = await mkdtemp(join(tmpdir(), 'automationstudio-agent-'));
    cleanups.push(project);
    const scenarios = join(project, 'automation', 'scenarios');
    await mkdir(scenarios, { recursive: true });
    await writeFile(join(scenarios, 'login.scenario.json'), JSON.stringify({
      mode: 'playwright', steps: [
        { type: 'type', target: '#username', description: 'Fill Username', parameters: [{ name: 'value', value: 'qa' }] },
        { type: 'click', target: '#submit', description: 'Click Login button' },
      ],
    }));
    await writeFile(join(scenarios, 'surface.scenario.json'), JSON.stringify({
      mode: 'surface', steps: [
        { type: 'type', target: 'Username', description: 'Fill Username text box', surface: { locators: [{ strategy: 'ocr', value: 'Username', priority: 10 }] } },
      ],
    }));

    const service = new AutomationStudioAgentService();
    const preview = await service.buildObjectRepository({ projectPath: project });
    expect(preview.writeRequested).toBe(false);
    expect(preview.objects.map((object) => object.id)).toEqual(['app.login', 'app.username']);
    expect(preview.objects.find((object) => object.id === 'app.username')?.pw?.css).toBe('#username');
    expect(preview.objects.find((object) => object.id === 'app.username')?.surface?.[0].value).toBe('Username');

    const saved = await service.buildObjectRepository({ projectPath: project, write: true });
    expect(saved.created).toContain('app.username');
    expect(await readFile(join(project, 'automation', 'object-repository', 'app.username.object.json'), 'utf8')).toContain('Username');
  });

  it('generates a readable Gherkin hierarchy and saves only when requested', async () => {
    const project = await mkdtemp(join(tmpdir(), 'automationstudio-gherkin-'));
    cleanups.push(project);
    const service = new AutomationStudioAgentService();
    const preview = await service.generateGherkin({
      projectPath: project,
      scenarioName: 'Valid login',
      text: 'Open the login page\nEnter a valid username and password\nClick Login\nVerify the dashboard is visible',
    });
    expect(preview.written).toBe(false);
    expect(preview.feature).toContain('Feature: Valid Login');
    expect(preview.feature).toContain('When Click Login');
    expect(preview.feature).toContain('Then Verify the dashboard is visible');

    const saved = await service.generateGherkin({
      projectPath: project,
      scenarioName: 'Valid login',
      text: 'Open the login page\nClick Login',
      write: true,
    });
    expect(saved.written).toBe(true);
    expect(await readFile(join(project, saved.featurePath), 'utf8')).toContain('Feature: Valid Login');
  });
});
