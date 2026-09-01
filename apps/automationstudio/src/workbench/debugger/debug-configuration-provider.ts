import * as vscode from 'vscode';
import { AutomationDebugSession } from './debug-adapter';
import { RuntimeEngine } from '@automation-studio/runtime';

export class AutomationDebugConfigurationProvider implements vscode.DebugConfigurationProvider {
    resolveDebugConfiguration(folder: vscode.WorkspaceFolder | undefined, config: vscode.DebugConfiguration, token?: vscode.CancellationToken): vscode.ProviderResult<vscode.DebugConfiguration> {
        
        if (!config.type && !config.request && !config.name) {
            const editor = vscode.window.activeTextEditor;
            if (editor && editor.document.languageId === 'json' && editor.document.fileName.endsWith('.scenario.json')) {
                config.type = 'automation-studio';
                config.name = 'Debug Current Scenario';
                config.request = 'launch';
                config['scenarioPath'] = '${file}';
                config['stopOnEntry'] = true;
            }
        }

        if (!config['scenarioPath']) {
            return vscode.window.showInformationMessage("Cannot find a program to debug").then(_ => {
                return undefined;
            });
        }

        return config;
    }
}

export class AutomationDebugAdapterDescriptorFactory implements vscode.DebugAdapterDescriptorFactory {
    constructor(private readonly engine: RuntimeEngine) {}

    createDebugAdapterDescriptor(session: vscode.DebugSession, executable: vscode.DebugAdapterExecutable | undefined): vscode.ProviderResult<vscode.DebugAdapterDescriptor> {
        return new vscode.DebugAdapterInlineImplementation(new AutomationDebugSession(this.engine));
    }
}
