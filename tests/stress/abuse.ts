import { exec } from 'child_process';
import * as path from 'path';

const NUM_SCENARIOS = 100;
const PARALLEL_LIMIT = 20;

async function runScenario(id: number) {
  return new Promise((resolve) => {
    console.log(`Starting scenario ${id}...`);
    const cliPath = path.resolve(__dirname, '../../cli/dist/index.js');
    const scenarioPath = path.resolve(__dirname, '../e2e/test_large_output.py');
    const child = exec(`node ${cliPath} run ${scenarioPath}`, { maxBuffer: 1024 * 1024 * 10 });
    
    child.on('close', (code) => {
      console.log(`Scenario ${id} finished with code ${code}`);
      resolve(code);
    });
  });
}

async function main() {
  console.log(`Starting stress test: ${NUM_SCENARIOS} scenarios, max ${PARALLEL_LIMIT} in parallel...`);
  const active = new Set<Promise<any>>();
  const startTime = Date.now();
  let completed = 0;

  for (let i = 0; i < NUM_SCENARIOS; i++) {
    if (active.size >= PARALLEL_LIMIT) {
      await Promise.race(active);
    }
    
    const p = runScenario(i).then(() => {
      active.delete(p);
      completed++;
      console.log(`Progress: ${completed}/${NUM_SCENARIOS}`);
    });
    active.add(p);
  }

  await Promise.all(active);
  console.log(`Stress test completed in ${Date.now() - startTime}ms`);
}

main().catch(console.error);
