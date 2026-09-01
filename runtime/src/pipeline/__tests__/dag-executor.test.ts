import { describe, expect, it, vi } from 'vitest';
import { DAGExecutor, type DAGNode } from '../dag-executor';

const engine = () => ({
  executeHooks: vi.fn().mockResolvedValue(undefined),
  plugins: { context: { logger: { debug: vi.fn(), error: vi.fn() } } },
}) as any;

const node = (id: string, dependencies: string[], execute = vi.fn().mockResolvedValue(undefined)): DAGNode => ({
  id,
  name: id,
  dependencies,
  execute,
});

describe('DAGExecutor', () => {
  it('executes dependency waves without recursive scheduling', async () => {
    const calls: string[] = [];
    const first = node('first', [], async () => { calls.push('first'); });
    const second = node('second', ['first'], async () => { calls.push('second'); });

    await new DAGExecutor(engine()).run();
    expect(calls).toEqual([]);

    const executor = new DAGExecutor(engine());
    executor.addNode(first);
    executor.addNode(second);
    await executor.run();
    expect(calls).toEqual(['first', 'second']);
  });

  it('fails fast for unresolved cyclic dependencies', async () => {
    const executor = new DAGExecutor(engine());
    executor.addNode(node('a', ['b']));
    executor.addNode(node('b', ['a']));

    await expect(executor.run()).rejects.toThrow('cycle or unresolved dependency');
  });
});
