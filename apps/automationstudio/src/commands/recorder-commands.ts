import * as vscode from 'vscode';
import type { ICommandDescriptor, IServiceProvider } from '@automation-studio/types';
import { TYPES } from '../di/types';
import { RecorderManager } from '../workbench/recorder-manager';

export function createRecorderCommands(provider: IServiceProvider): ReadonlyArray<ICommandDescriptor> {
  const recorderManager = provider.resolve<RecorderManager>(TYPES.RecorderManager);
  
  return [
    {
      id: 'automationStudio.recorder.start',
      title: 'Start Recording',
      category: 'Recorder',
      telemetry: true,
      handler: async (pluginIdOrOptions?: any, maybeOptions?: any): Promise<void> => {
        let pluginId = 'vision';
        let options: any = undefined;

        if (typeof pluginIdOrOptions === 'string') {
          pluginId = pluginIdOrOptions;
          options = maybeOptions;
        } else if (pluginIdOrOptions && typeof pluginIdOrOptions === 'object') {
          options = pluginIdOrOptions;
        }

        try {
          const projectService = provider.resolve<any>(TYPES.ProjectService);
          const currentProject = projectService?.manager?.getCurrentProject();
          if (currentProject?.technology === 'playwright') {
            pluginId = 'playwright';
          }
        } catch (e) {
          // ignore
        }
        await recorderManager.startRecording(pluginId, options);
      },
    },
    {
      id: 'automationStudio.recorder.pause',
      title: 'Pause Recording',
      category: 'Recorder',
      telemetry: true,
      handler: async (): Promise<void> => {
        await recorderManager.pauseRecording();
      },
    },
    {
      id: 'automationStudio.recorder.stop',
      title: 'Stop Recording',
      category: 'Recorder',
      telemetry: true,
      handler: async (): Promise<void> => {
        await recorderManager.stopRecording();
      },
    },
    {
      id: 'automationStudio.recorder.resume',
      title: 'Resume Recording',
      category: 'Recorder',
      telemetry: true,
      handler: async (): Promise<void> => {
        await recorderManager.resumeRecording();
      },
    },
    {
      id: 'automationStudio.recorder.cancel',
      title: 'Cancel Recording',
      category: 'Recorder',
      telemetry: true,
      handler: async (): Promise<void> => {
        await recorderManager.cancelRecording();
      },
    },
    {
      id: 'automationStudio.recorder.generate',
      title: 'Generate Scenario',
      category: 'Recorder',
      telemetry: true,
      handler: async (): Promise<void> => {
        await recorderManager.generateScenario();
      },
    }
  ];
}
