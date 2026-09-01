import type { RuntimeEngine } from '../engine/runtime-engine';
import { ExecutionError } from '../errors';

export interface PipelineStage {
  id: string;
  name: string;
  execute(engine: RuntimeEngine, context?: any): Promise<void>;
}

export class ExecutionPipeline {
  private stages: PipelineStage[] = [];

  constructor(private readonly engine: RuntimeEngine) {}

  public addStage(stage: PipelineStage): void {
    this.stages.push(stage);
  }

  public async run(): Promise<void> {
    try {
      await this.engine.executeHooks('before_pipeline');

      for (const stage of this.stages) {
        this.engine.plugins.context.logger?.debug?.(`Executing pipeline stage: ${stage.name}`);
        await this.engine.executeHooks(`before_stage_${stage.id}`);
        
        await stage.execute(this.engine);
        
        await this.engine.executeHooks(`after_stage_${stage.id}`);
      }

      await this.engine.executeHooks('after_pipeline');
    } catch (error) {
      await this.engine.executeHooks('on_pipeline_error', error);
      throw new ExecutionError(`Pipeline execution failed: ${(error as Error).message}`, { cause: error });
    }
  }
}
