import { ExecutionPlan } from '@automation-studio/sdk';
import { ExecutionBus } from '../events/execution-bus';
import { ExecutionController } from '../debugger/execution-controller';

export class ExecutionScheduler implements ExecutionController {
    private isPaused = false;
    private isCancelled = false;
    private stepSignal: (() => void) | null = null;
    private queue: string[] = [];
    private visited = new Set<string>();

    constructor(
        private plan: ExecutionPlan,
        private bus: ExecutionBus
    ) {}

    public async execute(): Promise<void> {
        this.queue = [...this.plan.entryNodes];
        
        while (this.queue.length > 0 && !this.isCancelled) {
            if (this.isPaused) {
                await this.waitForStep();
            }

            const nodeId = this.queue.shift()!;
            
            // Allow cycles by not skipping visited, or implement more complex logic.
            // For now, to allow cycles like a While loop, we don't block on visited
            // but we must be careful. If it's a DAG, visited is fine. With cycles, we must evaluate conditions.
            
            const node = this.plan.graph.nodes.find(n => n.id === nodeId);
            if (!node) continue;

            if (node.breakpoint?.enabled) {
                this.pause();
                this.bus.emit({ type: 'BreakpointHit', nodeId: node.id, timestamp: Date.now() });
                await this.waitForStep();
            }

            this.bus.emit({ type: 'NodeStarted', nodeId: node.id, timestamp: Date.now() });
            
            // EXECUTE NODE PAYLOAD (mocked for now)
            let success = true;

            this.bus.emit({ type: 'NodeFinished', nodeId: node.id, timestamp: Date.now(), payload: { success } });

            // Resolve edges
            const edges = this.plan.graph.edges.filter(e => e.source === nodeId);
            for (const edge of edges) {
                if (edge.condition === 'always' || 
                   (edge.condition === 'success' && success) || 
                   (edge.condition === 'failure' && !success)) {
                    this.queue.push(edge.target);
                }
            }
        }
    }

    private waitForStep(): Promise<void> {
        return new Promise(resolve => {
            this.stepSignal = resolve;
        });
    }

    public pause(): void { this.isPaused = true; }
    public resume(): void { 
        this.isPaused = false; 
        if (this.stepSignal) { this.stepSignal(); this.stepSignal = null; }
    }
    public cancel(): void { this.isCancelled = true; this.resume(); }
    public stepInto(): void { if (this.stepSignal) { this.stepSignal(); this.stepSignal = null; } }
    public stepOver(): void { this.stepInto(); }
    public stepOut(): void { this.stepInto(); }
    public restart(): void { /* reset state */ }
}
