import { Stopwatch } from '@automation-studio/shared';
import { EventBus } from '@automation-studio/events';
import { ServiceCollection } from '../../src/di/service-collection';
import { ServiceProvider } from '../../src/di/service-provider';
import { ConfigurationService } from '../../src/configuration/configuration-service';
import { Logger, ConsoleSink } from '@automation-studio/logger';
import { LogLevel } from '@automation-studio/types';
import * as fs from 'fs';
import * as path from 'path';

async function profile() {
  const timings: Record<string, number> = {};
  
  // 1. Event Bus Creation
  let sw = new Stopwatch().start();
  const eventBus = new EventBus({ maxHistorySize: 200, enableReplay: true });
  timings['Event Bus Creation'] = sw.stop();

  // 2. DI Initialization
  sw = new Stopwatch().start();
  const collection = new ServiceCollection();
  const provider = new ServiceProvider(collection);
  timings['DI Initialization'] = sw.stop();

  // 3. Configuration Load
  sw = new Stopwatch().start();
  const logger = new Logger('Test', [new ConsoleSink()], { level: LogLevel.Fatal });
  const mockWorkspace = {
    getConfiguration: () => ({ get: () => undefined }),
    onDidChangeConfiguration: () => ({ dispose: () => {} })
  };
  const configService = new ConfigurationService(mockWorkspace as any, eventBus, logger);
  await configService.initialize();
  timings['Configuration Load'] = sw.stop();

  // 4. Activation Time
  // We'll mock the whole bootstrapper if needed, but let's just do a synthetic run of bootstrap
  const { bootstrap } = await import('../../src/bootstrap/bootstrapper');
  const mockContext = {
    subscriptions: [],
    workspaceState: { get: () => undefined, update: async () => {} },
    globalState: { get: () => undefined, update: async () => {} },
    secrets: { get: async () => undefined, store: async () => {}, delete: async () => {} }
  };
  
  // Need to mock vscode module globally
  const Module = require('module');
  const originalRequire = Module.prototype.require;
  Module.prototype.require = function(request: string) {
    if (request === 'vscode') {
      return {
        workspace: mockWorkspace,
        commands: { registerCommand: () => ({ dispose: () => {} }) },
      };
    }
    return originalRequire.apply(this, arguments);
  };

  const bootstrapResult = await bootstrap(mockContext as any);
  timings['Activation'] = bootstrapResult.activationTime;

  // 5. Memory After Startup
  const used = process.memoryUsage();
  const memoryMB = Math.round((used.heapUsed / 1024 / 1024) * 100) / 100;

  // Formatting output
  let markdown = `# Benchmark Results\n\n`;
  markdown += `| Metric | Target | Actual | Status |\n`;
  markdown += `|--------|--------|--------|--------|\n`;
  
  const targets: Record<string, number> = {
    'Activation': 2000,
    'DI Initialization': 50,
    'Configuration Load': 20,
    'Event Bus Creation': 10
  };

  for (const [metric, target] of Object.entries(targets)) {
    const actual = timings[metric] ?? 0;
    const status = actual < target ? '✅ PASS' : '❌ FAIL';
    markdown += `| ${metric} | <${target}ms | **${actual.toFixed(2)}ms** | ${status} |\n`;
  }
  
  const memStatus = memoryMB < 100 ? '✅ PASS' : '❌ FAIL';
  markdown += `| Memory After Startup | <100MB | **${memoryMB}MB** | ${memStatus} |\n`;

  const outPath = path.resolve(__dirname, '../../../../../../.gemini/antigravity-ide/brain/ebc30e8c-33f4-4eb2-8cbe-e71142d7f5fa/benchmark-results.md');
  fs.writeFileSync(outPath, markdown);
  console.log(`Benchmarks written to ${outPath}`);
  console.log(markdown);
}

profile().catch(console.error);
