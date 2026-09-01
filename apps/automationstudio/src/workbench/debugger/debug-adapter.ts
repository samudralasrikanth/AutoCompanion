import {
    LoggingDebugSession,
    InitializedEvent,
    TerminatedEvent,
    StoppedEvent,
    BreakpointEvent,
    OutputEvent,
    Thread,
    StackFrame,
    Scope,
    Source
} from '@vscode/debugadapter';
import { DebugProtocol } from '@vscode/debugprotocol';
import { RuntimeEngine } from '@automation-studio/runtime';
import { ScenarioRunner, ScenarioRunOptions } from '@automation-studio/runtime/dist/engine/scenario-runner';

export interface LaunchRequestArguments extends DebugProtocol.LaunchRequestArguments {
    scenarioPath: string;
    stopOnEntry?: boolean;
}

export class AutomationDebugSession extends LoggingDebugSession {
    private static THREAD_ID = 1;
    private runner: ScenarioRunner;

    constructor(private readonly engine: RuntimeEngine) {
        super();
        this.setDebuggerLinesStartAt1(true);
        this.setDebuggerColumnsStartAt1(true);
        this.runner = new ScenarioRunner(this.engine);
        
        // Wire up ExecutionBus to VS Code Events
        this.runner.bus.subscribe('BreakpointHit', (event) => {
            this.sendEvent(new StoppedEvent('breakpoint', AutomationDebugSession.THREAD_ID));
        });

        this.runner.bus.subscribe('NodeStarted', (event) => {
            this.sendEvent(new OutputEvent(`Starting node: ${event.nodeId}\n`, 'stdout'));
        });

        this.runner.bus.subscribe('NodeFinished', (event) => {
            this.sendEvent(new OutputEvent(`Finished node: ${event.nodeId}\n`, 'stdout'));
        });

        this.runner.bus.subscribe('Error', (event) => {
            this.sendEvent(new OutputEvent(`Error: ${event.payload?.message}\n`, 'stderr'));
        });
    }

    protected override initializeRequest(response: DebugProtocol.InitializeResponse, args: DebugProtocol.InitializeRequestArguments): void {
        response.body = response.body || {};
        response.body.supportsConfigurationDoneRequest = true;
        response.body.supportsStepBack = false;
        this.sendResponse(response);
        this.sendEvent(new InitializedEvent());
    }

    protected override configurationDoneRequest(response: DebugProtocol.ConfigurationDoneResponse, args: DebugProtocol.ConfigurationDoneArguments): void {
        super.configurationDoneRequest(response, args);
    }

    protected override async launchRequest(response: DebugProtocol.LaunchResponse, args: LaunchRequestArguments, request?: DebugProtocol.Request) {
        this.sendResponse(response);
        
        try {
            const options: ScenarioRunOptions = {
                path: args.scenarioPath,
                debug: true
            };

            await this.runner.runScenario(options);
            
            this.sendEvent(new TerminatedEvent());
        } catch (e) {
            this.sendEvent(new OutputEvent(`Execution failed: ${e}\n`, 'stderr'));
            this.sendEvent(new TerminatedEvent());
        }
    }

    protected override threadsRequest(response: DebugProtocol.ThreadsResponse): void {
        response.body = {
            threads: [
                new Thread(AutomationDebugSession.THREAD_ID, "Automation Thread")
            ]
        };
        this.sendResponse(response);
    }

    protected override stackTraceRequest(response: DebugProtocol.StackTraceResponse, args: DebugProtocol.StackTraceArguments): void {
        const frames: StackFrame[] = [];
        
        // In a real implementation we would fetch the current Node from the activeScheduler
        // For now, return a mock frame
        const currentActiveNodeId = this.runner.activeScheduler ? 'unknown' : 'done';
        
        frames.push(new StackFrame(1, `Node ${currentActiveNodeId}`, undefined, 0, 0));
        
        response.body = {
            stackFrames: frames,
            totalFrames: 1
        };
        this.sendResponse(response);
    }

    protected override scopesRequest(response: DebugProtocol.ScopesResponse, args: DebugProtocol.ScopesArguments): void {
        response.body = {
            scopes: [
                new Scope("Variables", 1, false)
            ]
        };
        this.sendResponse(response);
    }

    protected override variablesRequest(response: DebugProtocol.VariablesResponse, args: DebugProtocol.VariablesArguments): void {
        response.body = {
            variables: []
        };
        this.sendResponse(response);
    }

    protected override continueRequest(response: DebugProtocol.ContinueResponse, args: DebugProtocol.ContinueArguments): void {
        if (this.runner.activeScheduler) {
            this.runner.activeScheduler.resume();
        }
        this.sendResponse(response);
    }

    protected override nextRequest(response: DebugProtocol.NextResponse, args: DebugProtocol.NextArguments): void {
        if (this.runner.activeScheduler) {
            this.runner.activeScheduler.stepOver();
        }
        this.sendResponse(response);
    }

    protected override stepInRequest(response: DebugProtocol.StepInResponse, args: DebugProtocol.StepInArguments): void {
        if (this.runner.activeScheduler) {
            this.runner.activeScheduler.stepInto();
        }
        this.sendResponse(response);
    }

    protected override stepOutRequest(response: DebugProtocol.StepOutResponse, args: DebugProtocol.StepOutArguments): void {
        if (this.runner.activeScheduler) {
            this.runner.activeScheduler.stepOut();
        }
        this.sendResponse(response);
    }

    protected override pauseRequest(response: DebugProtocol.PauseResponse, args: DebugProtocol.PauseArguments): void {
        if (this.runner.activeScheduler) {
            this.runner.activeScheduler.pause();
            this.sendEvent(new StoppedEvent('pause', AutomationDebugSession.THREAD_ID));
        }
        this.sendResponse(response);
    }
}
