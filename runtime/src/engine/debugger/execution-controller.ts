export interface ExecutionController {
    pause(): void;
    resume(): void;
    cancel(): void;
    stepInto(): void;
    stepOver(): void;
    stepOut(): void;
    restart(): void;
}
