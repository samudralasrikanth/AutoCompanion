import { describe, expect, it, vi } from 'vitest';
vi.mock('vscode', () => ({
  default: {
    lm: { registerTool: vi.fn() },
    chat: { createChatParticipant: vi.fn(() => ({ iconPath: undefined })) },
    env: { createTelemetryLogger: vi.fn(() => ({ logUsage: vi.fn() })) },
    LanguageModelToolResult: class {},
    LanguageModelTextPart: class {},
    Uri: { joinPath: vi.fn(), file: vi.fn() }
  },
  lm: { registerTool: vi.fn() },
  chat: { createChatParticipant: vi.fn(() => ({ iconPath: undefined })) },
  env: { createTelemetryLogger: vi.fn(() => ({ logUsage: vi.fn() })) },
  LanguageModelToolResult: class {},
  LanguageModelTextPart: class {},
  Uri: { joinPath: vi.fn(), file: vi.fn() }
}));

import { AutomationStudioCopilotAgents } from '../agents/copilot-agents';
import * as vscode from 'vscode';

describe('AutomationStudioCopilotAgents', () => {
  it('instantiates correctly and handles missing vscode.lm gracefully in tests', () => {
    const projectService = { getCurrentProjectPath: () => '/fake/path' };
    const agents = new AutomationStudioCopilotAgents(projectService);
    expect(agents).toBeDefined();

    const mockContext: any = { subscriptions: [], extensionUri: vscode.Uri.file('/fake') };
    
    agents.register(mockContext);
    
    expect(vscode.lm.registerTool).toHaveBeenCalled();
  });
});
