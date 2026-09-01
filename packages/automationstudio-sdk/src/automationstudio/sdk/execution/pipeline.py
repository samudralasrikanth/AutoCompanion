"""
The pluggable Pipeline architecture.
Orchestrates every action through discrete stages.
"""
from typing import List, Any
import time
from ..contracts.interfaces import IExecutionPipeline, IPipelineStage
from ..runtime.context import AutomationContext
from ..models.execution import ExecutionResult, ExecutionStatus, StepResult, Metrics
from ..recovery.policy import LinearRetryPolicy

class ExecutionPipeline(IExecutionPipeline):
    """The central pipeline for deterministic execution."""
    def __init__(self, retry_policy: Any = None):
        self._stages: List[IPipelineStage] = []
        self.retry_policy = retry_policy or LinearRetryPolicy()

    def add_stage(self, stage: IPipelineStage) -> None:
        """Inject a custom or core stage into the pipeline."""
        self._stages.append(stage)

    def execute_action(self, action: Any, context: Any) -> Any:
        """Execute a single action through all stages."""
        current_action = action
        for stage in self._stages:
            current_action = stage.execute(current_action, context)
        return current_action

    def execute_plan(self, plan: Any, context: Any = None) -> ExecutionResult:
        start_time = time.time()
        step_results = []
        overall_status = ExecutionStatus.COMPLETED

        for step in plan.root_node.children:
            step_start = time.time()
            attempts = 0
            step_status = ExecutionStatus.COMPLETED
            trace_log = []

            while True:
                attempts += 1
                current_action = step
                try:
                    for stage in self._stages:
                        if stage.stage_name == "RecoveryStage":
                            continue
                        stage_start = time.time()

                        result = stage.execute(current_action, context)
                        duration = (time.time() - stage_start) * 1000

                        if stage.stage_name == "AdapterStage":
                            provider = getattr(result, "provider", "UnknownProvider")
                            trace_log.append(f"Stage: {stage.stage_name} | Provider: {provider} | Duration: {duration:.2f}ms | Result: SUCCESS")
                        elif stage.stage_name == "VerificationStage":
                            trace_log.append(f"Stage: {stage.stage_name} | Duration: {duration:.2f}ms | Result: PASS")
                        elif stage.stage_name == "IdentificationStage" and hasattr(current_action, "target_identifier") and getattr(current_action.target_identifier, "found", False):
                            strategy_used = getattr(current_action.target_identifier, "strategy_used", "Unknown")
                            trace_log.append(f"Stage: {stage.stage_name} | Strategy: {strategy_used} | Duration: {duration:.2f}ms | Result: SUCCESS")
                        else:
                            trace_log.append(f"Stage: {stage.stage_name} | Duration: {duration:.2f}ms | Result: SUCCESS")

                        current_action = result

                    # If we make it through all stages without exception, step succeeded
                    step_status = ExecutionStatus.COMPLETED
                    break

                except Exception as e:
                    from ..foundation.exceptions import AbortPipelineError
                    
                    if isinstance(e, AbortPipelineError):
                        trace_log.append(f"AbortPipelineError: {str(e)}")
                        trace_log.append("Pipeline aborted explicitly.")
                        step_status = ExecutionStatus.FAILED
                        overall_status = ExecutionStatus.FAILED
                        # Run AuditStage before breaking out
                        audit_stage = next((s for s in self._stages if s.stage_name == "AuditStage"), None)
                        if audit_stage:
                            if hasattr(current_action, "diagnostics"):
                                current_action.diagnostics["error"] = str(e)
                            elif hasattr(current_action, "parameters"):
                                current_action.parameters["error"] = str(e)
                            audit_stage.execute(current_action, context)
                        break

                    trace_log.append(f"Error: {str(e)}")
                    trace_log.append(f"Recovery attempt {attempts}...")
                    
                    # Ensure AuditStage is run even on failure
                    audit_stage = next((s for s in self._stages if s.stage_name == "AuditStage"), None)
                    if audit_stage:
                        # Attach error to action for audit if possible
                        if hasattr(current_action, "diagnostics"):
                            current_action.diagnostics["error"] = str(e)
                        elif hasattr(current_action, "parameters"):
                            current_action.parameters["error"] = str(e)
                        audit_stage.execute(current_action, context)

                    recovery_stage = next((s for s in self._stages if s.stage_name == "RecoveryStage"), None)
                    if recovery_stage:
                        decision = recovery_stage.execute(step, context)
                        from ..recovery.policy import RecoveryDecision
                        if decision == RecoveryDecision.ABORT:
                            trace_log.append("Recovery aborted by policy")
                            step_status = ExecutionStatus.FAILED
                            overall_status = ExecutionStatus.FAILED
                            break
                        
                        # Apply backoff delay from retry policy
                        delay_ms = self.retry_policy.next_delay_ms(attempts)
                        if delay_ms > 0:
                            time.sleep(delay_ms / 1000.0)
                        continue
                    else:
                        trace_log.append("retries exhausted (no recovery stage)")
                        step_status = ExecutionStatus.FAILED
                        overall_status = ExecutionStatus.FAILED
                        break

            step_results.append(StepResult(
                action_id=step.node_type,
                status=step_status,
                duration_ms=(time.time() - step_start) * 1000,
                logs=trace_log,
                recovery_attempts=attempts - 1
            ))

            if overall_status == ExecutionStatus.FAILED:
                break

        audit_path = context.execution.state_snapshots.get("audit_path", "") if context else ""

        return ExecutionResult(
            execution_id=context.execution.execution_id if context else "exec-001",
            plan_id=plan.plan_id,
            status=overall_status,
            start_time=start_time,
            end_time=time.time(),
            steps=step_results,
            overall_metrics=Metrics(),
            artifacts={"audit_log": audit_path, "screenshot": f"artifacts/{context.execution.execution_id}/screen.png"} if context else {}
        )