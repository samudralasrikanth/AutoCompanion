import { BaseFramework } from '@automation-studio/sdk';
import type { IPluginContext } from '@automation-studio/types';
import { ActionPipeline } from '@automation-studio/sdk';
import { VisionInspector } from './inspector/vision-inspector';
import { VisionRecorder } from './recorder/vision-recorder';
import { PythonBackend } from './executor/python-backend';
import { VisionEngine } from './vision/vision-engine';
import { VisionActionRegistry } from './actions/vision-action-registry';
export * from './vision/vision-types';
export * from './vision/vision-executor-types';
export * from './actions/action-types';
export * from './actions/vision-action-registry';
export * from './recorder/vision-recorder-plugin';
export * from './recorder/vision-recorder';
export * from './recorder/vision-enricher';

export default class VisionPlugin extends BaseFramework {
  public inspector!: VisionInspector;
  public recorder!: VisionRecorder;
  public backend!: PythonBackend;
  public pipeline!: ActionPipeline;
  public actionRegistry!: VisionActionRegistry;
  private visionEngine!: VisionEngine;

  constructor() {
    super('vision', '0.1.0');
  }

  public async initialize(context?: IPluginContext): Promise<void> {
    if (context) {
      context.logger.info('Initializing Vision Vision Plugin...');
    }
    this.visionEngine = new VisionEngine();
    this.inspector = new VisionInspector();
    this.recorder = new VisionRecorder();
    this.backend = new PythonBackend(this.visionEngine);
    this.pipeline = new ActionPipeline(this.backend);
    this.actionRegistry = new VisionActionRegistry();
  }

  public async dispose(): Promise<void> {
    // cleanup
  }
}
