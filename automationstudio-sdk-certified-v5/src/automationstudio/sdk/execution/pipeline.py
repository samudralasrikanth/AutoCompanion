"""Stage pipeline with per-step bounded retries and structured tracing."""
from typing import Any, List
import time

from ..contracts.interfaces import IExecutionPipeline, IPipelineStage
from ..models.execution import ExecutionResult, ExecutionStatus, Metrics, StepResult
from ..recovery.policy import ImmediateRetryPolicy


class ExecutionPipeline(IExecutionPipeline):
    def __init__(self, retry_policy: Any = None):
        self._stages: List[IPipelineStage] = []
        self.retry_policy = retry_policy or ImmediateRetryPolicy()

    def add_stage(self, stage: IPipelineStage) -> None:
        self._stages.append(stage)

    def execute_action(self, action: Any, context: Any) -> Any:
        current_action = action
        for stage in self._stages:
            current_action = stage.execute(current_action, context)
        return current_action

    def _audit(self, action: Any, context: Any, trace: list[dict[str, Any]]) -> None:
        context.execution.state_snapshots["current_trace"] = trace
        audit_stage = next((stage for stage in self._stages if stage.stage_name == "AuditStage"), None)
        if audit_stage is not None:
            audit_stage.execute(action, context)

    def execute_plan(self, plan: Any, context: Any = None) -> ExecutionResult:
        start_time = time.time()
        step_results: list[StepResult] = []
        overall_status = ExecutionStatus.COMPLETED

        for step in plan.root_node.children:
            step_start = time.time()
            attempts = 0
            last_error: str | None = None
            trace: list[dict[str, Any]] = []
            if context is not None:
                context.execution.current_step_id = step.node_id
                context.execution.retry_count = 0

            while True:
                attempts += 1
                current_action = step
                try:
                    for stage in self._stages:
                        if stage.stage_name == "RecoveryStage":
                            continue
                        stage_start = time.time()
                        try:
                            result = stage.execute(current_action, context)
                        except Exception as error:
                            trace.append({
                                "stage": stage.stage_name,
                                "duration_ms": (time.time() - stage_start) * 1000,
                                "status": "failed",
                                "error": str(error),
                            })
                            raise
                        duration = (time.time() - stage_start) * 1000
                        event: dict[str, Any] = {
                            "stage": stage.stage_name,
                            "duration_ms": duration,
                            "status": "passed",
                        }
                        provider = getattr(result, "provider", None)
                        if provider:
                            event["provider"] = provider
                        resolved = getattr(result, "target_identifier", None)
                        strategy = getattr(resolved, "strategy_used", None)
                        if strategy:
                            event["strategy"] = strategy
                        if stage.stage_name == "AdapterStage":
                            event["message"] = f"Stage: AdapterStage | Provider: {provider or 'UnknownProvider'} | Duration: {duration:.2f}ms | Result: SUCCESS"
                        elif stage.stage_name == "VerificationStage":
                            event["message"] = f"Stage: VerificationStage | Duration: {duration:.2f}ms | Result: PASS"
                        elif stage.stage_name == "IdentificationStage" and strategy:
                            event["message"] = f"Stage: IdentificationStage | Strategy: {strategy} | Duration: {duration:.2f}ms | Result: SUCCESS"
                        else:
                            event["message"] = f"Stage: {stage.stage_name} | Duration: {duration:.2f}ms | Result: SUCCESS"
                        trace.append(event)
                        current_action = result

                    step_status = ExecutionStatus.COMPLETED
                    last_error = None
                    break
                except Exception as error:
                    from ..foundation.exceptions import AbortPipelineError
                    last_error = str(error)
                    trace.append({"attempt": attempts, "status": "recovery", "error": last_error})
                    self._audit(current_action, context, trace)
                    if isinstance(error, AbortPipelineError):
                        step_status = ExecutionStatus.FAILED
                        overall_status = ExecutionStatus.FAILED
                        break

                    recovery_stage = next((stage for stage in self._stages if stage.stage_name == "RecoveryStage"), None)
                    if recovery_stage is None:
                        step_status = ExecutionStatus.FAILED
                        overall_status = ExecutionStatus.FAILED
                        break
                    decision = recovery_stage.execute(step, context)
                    from ..recovery.policy import RecoveryDecision
                    if decision == RecoveryDecision.ABORT:
                        trace.append({"stage": "RecoveryStage", "status": "aborted"})
                        step_status = ExecutionStatus.FAILED
                        overall_status = ExecutionStatus.FAILED
                        break
                    delay_ms = self.retry_policy.next_delay_ms(attempts)
                    if delay_ms > 0:
                        time.sleep(delay_ms / 1000.0)

            if context is not None:
                context.execution.state_snapshots["current_trace"] = trace
            logs: list[str] = []
            for item in trace:
                if item.get("message"):
                    logs.append(item["message"])
                elif item.get("stage") == "RecoveryStage" and item.get("status") == "aborted":
                    logs.append("Recovery aborted by policy")
                elif item.get("status") == "recovery":
                    logs.append(f"Recovery attempt {item.get('attempt')}...")
                elif item.get("error"):
                    logs.append(f"Error: {item['error']}")
                else:
                    logs.append(f"{item.get('stage', item.get('status'))}: {item.get('status')}")
            step_results.append(StepResult(
                action_id=step.node_type,
                status=step_status,
                duration_ms=(time.time() - step_start) * 1000,
                error=last_error,
                logs=logs,
                recovery_attempts=max(0, attempts - 1),
                verification_passed=any(item.get("stage") == "VerificationStage" and item.get("status") == "passed" for item in trace),
                trace=trace,
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
            artifacts={"audit_log": audit_path} if context else {},
        )
