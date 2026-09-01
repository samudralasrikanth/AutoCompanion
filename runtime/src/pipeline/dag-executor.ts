import type { RuntimeEngine } from '../engine/runtime-engine';
import { ExecutionError } from '../errors';

export interface DAGNode {
  id: string;
  name: string;
  dependencies: string[];
  execute(engine: RuntimeEngine, context?: any): Promise<void>;
}

export class DAGExecutor {
  private nodes: Map<string, DAGNode> = new Map();

  constructor(private readonly engine: RuntimeEngine) {}

  public addNode(node: DAGNode): void {
    if (this.nodes.has(node.id)) {
      throw new ExecutionError(`DAG node with ID ${node.id} already exists`);
    }
    this.nodes.set(node.id, node);
  }

  public async run(): Promise<void> {
    try {
      await this.engine.executeHooks('before_dag_pipeline');

      const completed = new Set<string>();
      const running = new Set<string>();
      const failed = new Set<string>();

      while (completed.size + failed.size < this.nodes.size) {
        const promises: Promise<void>[] = [];

        for (const [id, node] of this.nodes.entries()) {
          if (completed.has(id) || running.has(id) || failed.has(id)) {
            continue;
          }

          const depsMet = node.dependencies.every(dep => completed.has(dep));
          const depsFailed = node.dependencies.some(dep => failed.has(dep));

          if (depsFailed) {
            failed.add(id);
            continue;
          }

          if (depsMet) {
            running.add(id);
            this.engine.plugins.context.logger?.debug?.(`[DAG] Starting node: ${node.name} (${node.id})`);

            promises.push((async () => {
              try {
                await this.engine.executeHooks(`before_node_${id}`);
                await node.execute(this.engine);
                await this.engine.executeHooks(`after_node_${id}`);
                completed.add(id);
              } catch (error) {
                failed.add(id);
                this.engine.plugins.context.logger?.error?.(`[DAG] Node ${node.id} failed:`, error as Error);
              } finally {
                running.delete(id);
              }
            })());
          }
        }

        if (promises.length === 0) {
          throw new ExecutionError('DAG contains a cycle or unresolved dependency');
        }

        await Promise.allSettled(promises);
      }

      if (failed.size > 0) {
        throw new ExecutionError('DAG execution finished with failures');
      }

      await this.engine.executeHooks('after_dag_pipeline');
    } catch (error) {
      await this.engine.executeHooks('on_dag_error', error);
      throw new ExecutionError(`DAG execution failed: ${(error as Error).message}`, { cause: error });
    }
  }
}
