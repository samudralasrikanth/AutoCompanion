import { IScenario, IStep } from '@automation-studio/sdk';
import { ExecutionGraph, ExecutionNode, ExecutionEdge } from '@automation-studio/sdk';

export class ExecutionPlanner {
    public plan(scenario: IScenario): { graph: ExecutionGraph, entryNodes: string[] } {
        const nodes: ExecutionNode[] = [];
        const edges: ExecutionEdge[] = [];
        
        let previousNodeId: string | null = null;
        let entryNodeId: string | null = null;

        // Track node IDs per phase for precise recovery wiring
        const mainStepNodeIds: string[] = [];
        let cleanupEntryNodeId: string | null = null;
        
        const addSequence = (steps: IStep[], type: 'step' | 'recovery', connectToPrevious = true) => {
            if (!steps || steps.length === 0) return;
            
            for (const step of steps) {
                const node: ExecutionNode = {
                    id: `node_${step.id}`,
                    payload: { kind: type, action: step },
                    status: 'pending'
                };
                nodes.push(node);
                
                if (!entryNodeId) {
                    entryNodeId = node.id;
                }
                
                if (connectToPrevious && previousNodeId) {
                    edges.push({
                        source: previousNodeId,
                        target: node.id,
                        condition: 'success'
                    });
                }
                previousNodeId = node.id;
            }
        };

        // Standard flow
        addSequence(scenario.preconditions || [], 'step');
        addSequence(scenario.steps, 'step');
        
        // Track which nodes are the main scenario steps (for recovery wiring)
        for (const step of scenario.steps) {
            mainStepNodeIds.push(`node_${step.id}`);
        }
        
        addSequence(scenario.assertions || [], 'step');
        
        // Track cleanup entry point before adding cleanup nodes
        if (scenario.cleanup && scenario.cleanup.length > 0) {
            cleanupEntryNodeId = `node_${scenario.cleanup[0]!.id}`;
        }
        addSequence(scenario.cleanup || [], 'step');
        
        // Build Recovery flow if it exists
        if (scenario.recovery && scenario.recovery.length > 0 && mainStepNodeIds.length > 0) {
            const recoveryEntryId = `node_${scenario.recovery[0]!.id}`;
            const nodeBeforeRecovery = previousNodeId;
            addSequence(scenario.recovery, 'recovery', false);
            
            // Wire failure edges only from main scenario steps to recovery
            for (const stepNodeId of mainStepNodeIds) {
                edges.push({
                    source: stepNodeId,
                    target: recoveryEntryId,
                    condition: 'failure'
                });
            }
            
            // After recovery completes, route to cleanup if it exists
            const recoveryExitNodeId = previousNodeId;
            if (recoveryExitNodeId && cleanupEntryNodeId) {
                edges.push({
                    source: recoveryExitNodeId,
                    target: cleanupEntryNodeId,
                    condition: 'always'
                });
            }

            // Recovery is a failure branch, not a continuation of the normal flow.
            // Keep the normal predecessor available for graph inspection and avoid
            // accidentally connecting cleanup to recovery through previousNodeId.
            previousNodeId = nodeBeforeRecovery;
        }

        return {
            graph: { nodes, edges },
            entryNodes: entryNodeId ? [entryNodeId] : []
        };
    }
}
