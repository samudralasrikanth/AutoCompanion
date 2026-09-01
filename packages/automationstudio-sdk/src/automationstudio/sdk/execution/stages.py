"""
Pluggable Pipeline Stages.
The sequence is strictly: State -> Identification -> Adapter -> Verification -> Recovery -> Audit.
"""
from typing import Any
from ..contracts.interfaces import IPipelineStage
from ..models.command import MouseCommand, KeyboardCommand, NavigationCommand, VerificationCommand
from ..models.workflow import ASTNode
from ..foundation.exceptions import ElementNotFoundError, ValidationError

class StateValidationStage(IPipelineStage):
    @property
    def stage_name(self) -> str:
        return "StateValidationStage"

    def execute(self, action: Any, context: Any) -> Any:
        if not isinstance(action, ASTNode):
            return action
        if not action.node_type:
            raise ValidationError("Action node has no type")
        return action

class CommandTranslationStage(IPipelineStage):
    """Translates generic AST nodes into typed physical Commands."""
    @property
    def stage_name(self) -> str:
        return "CommandTranslationStage"

    def _parse_target(self, target_data: Any) -> Any:
        from ..models.locator import VisualTarget, OCRTarget, NativeTarget
        if isinstance(target_data, dict):
            target_type = target_data.get("type")
            if target_type == "image":
                return VisualTarget(template_path=target_data.get("template", ""), threshold=target_data.get("threshold", 0.90))
            elif target_type == "ocr":
                return OCRTarget(text=target_data.get("text", ""))
            elif target_type == "native":
                return NativeTarget(selector=target_data.get("selector", ""), selector_type=target_data.get("selector_type", "auto"))
        return target_data

    def execute(self, action: Any, context: Any) -> Any:
        from ..models.command import MouseCommand, KeyboardCommand, NavigationCommand, VerificationCommand
        if not hasattr(action, 'node_type'):
            return action
        node_type = action.node_type
        params = getattr(action, 'parameters', {})

        target = self._parse_target(params.get("target") or params.get("title"))

        if node_type == "click":
            return MouseCommand(command_id=action.node_id, action="click", target_identifier=target)
        elif node_type == "type":
            return KeyboardCommand(command_id=action.node_id, action="type", target_identifier=target, text=params.get("text"))
        elif node_type in ("launch", "close", "wait_for_window"):
            return NavigationCommand(command_id=action.node_id, action=node_type, target_identifier=target)
        elif node_type == "verify":
            return VerificationCommand(command_id=action.node_id, verification_type=params.get("state", "exists"), expected_value=params.get("expected"), target_identifier=target)

        return action

class IdentificationStage(IPipelineStage):
    """Priority-based identification with Capability checking."""
    def __init__(self, adapter: Any = None):
        self.adapter = adapter
        from ..identification.strategies import AccessibilityStrategy, NativeStrategy, VisualStrategy, OCRStrategy
        acc_provider = getattr(self.adapter, 'accessibility_provider', None)
        visual_provider = getattr(self.adapter, 'visual_provider', None)
        ocr_provider = getattr(self.adapter, 'ocr_provider', None)
        native_provider = getattr(self.adapter, 'native_provider', None)
        self.strategies = [
            AccessibilityStrategy(acc_provider),
            NativeStrategy(native_provider),
            VisualStrategy(visual_provider),
            OCRStrategy(ocr_provider)
        ]

    @property
    def stage_name(self) -> str:
        return "IdentificationStage"

    def execute(self, action: Any, context: Any) -> Any:
        from ..models.command import InteractionCommand, VerificationCommand
        if isinstance(action, (InteractionCommand, VerificationCommand)) and getattr(action, 'target_identifier', None):

            # Request fresh capture from adapter if available (prevents stale capture)
            capture_frame = None
            if self.adapter and hasattr(self.adapter, "capture_provider") and self.adapter.capture_provider:
                capture_frame = self.adapter.capture_provider.capture(context)
                if hasattr(context, "execution"):
                    context.execution.active_capture = capture_frame
                    context.execution.state_snapshots["last_capture_id"] = capture_frame.capture_id

            diagnostics = []
            capabilities = getattr(context.runtime, 'capabilities', None)

            for strategy in self.strategies:
                # Check capabilities
                required_cap = getattr(strategy, "required_capability", None)
                if required_cap and capabilities:
                    has_cap = getattr(capabilities, required_cap, True)
                    if not has_cap:
                        reason = f"{required_cap} capability unavailable in current environment"
                        diagnostics.append(f"{strategy.name}: SKIPPED - reason = '{reason}'")
                        if hasattr(context, "execution"):
                            context.execution.state_snapshots["identification_diagnostics"] = diagnostics
                        continue

                # Pass capture_frame if strategy supports it
                if strategy.name in ["VisualStrategy", "OCRStrategy"]:
                    result = strategy.identify(action.target_identifier, context, capture_frame=capture_frame)
                else:
                    result = strategy.identify(action.target_identifier, context)

                if result.found:
                    diagnostics.append(f"{strategy.name}: EXECUTED - result = FOUND")
                    if hasattr(context, "execution"):
                        context.execution.state_snapshots["identification_diagnostics"] = diagnostics
                        context.execution.state_snapshots["last_strategy"] = result.strategy_used
                    action.target_identifier = result  # Attach resolved locator result
                    return action
                else:
                    diagnostics.append(f"{strategy.name}: EXECUTED - result = NOT_FOUND")

            if hasattr(context, "execution"):
                context.execution.state_snapshots["identification_diagnostics"] = diagnostics
            raise ElementNotFoundError(f"Identification Failure: Element not found by any strategy. Diagnostics: {diagnostics}")
        return action

class AdapterStage(IPipelineStage):
    """Executes the translated Command against the physical platform."""
    def __init__(self, adapter: Any = None):
        self.adapter = adapter

    @property
    def stage_name(self) -> str:
        return "AdapterStage"

    def execute(self, action: Any, context: Any) -> Any:
        from ..models.locator import LocatorResult
        from ..foundation.exceptions import StaleLocatorError
        
        # Enforce StaleLocatorError before any physical interaction
        if getattr(action, 'target_identifier', None) and isinstance(action.target_identifier, LocatorResult):
            last_capture_id = context.execution.state_snapshots.get("last_capture_id")
            if action.target_identifier.capture_id and last_capture_id:
                if action.target_identifier.capture_id != last_capture_id:
                    raise StaleLocatorError(
                        f"Stale Locator: locator capture_id '{action.target_identifier.capture_id}' "
                        f"does not match current active capture_id '{last_capture_id}'."
                    )
                    
        if self.adapter:
            try:
                res = self.adapter.execute_command(action, context)
                if isinstance(res, dict):
                    try:
                        action.provider = res.get("provider")
                    except Exception:
                        pass
                    if res.get("status") == "NOT_SUPPORTED":
                        from ..foundation.exceptions import AbortPipelineError
                        raise AbortPipelineError(f"Command not supported by adapter: {action}")
            except NotImplementedError as e:
                from ..foundation.exceptions import AbortPipelineError
                raise AbortPipelineError(str(e))
            return action
        
        try:
            action.provider = "NoAdapter"
        except Exception:
            pass
        return action

class VerificationStage(IPipelineStage):
    def __init__(self, adapter: Any = None):
        self.adapter = adapter

    @property
    def stage_name(self) -> str:
        return "VerificationStage"

    def execute(self, action: Any, context: Any) -> Any:
        from ..models.command import VerificationCommand
        from ..verification.state import StateVerification
        if isinstance(action, VerificationCommand):
            # Capture fresh state for verification
            capture_frame = None
            if self.adapter and hasattr(self.adapter, "capture_provider") and self.adapter.capture_provider:
                capture_frame = self.adapter.capture_provider.capture(context)
                if hasattr(context, "execution"):
                    context.execution.state_snapshots["verification_capture_id"] = capture_frame.capture_id

            from ..verification.state import StateVerification, VerificationStatus
            verifier = StateVerification(self.adapter)
            result = verifier.verify(action, context, capture_frame)
            if result.status != VerificationStatus.PASS:
                raise ValidationError(f"Verification FAIL: {result.reason}")
        return action

class RecoveryStage(IPipelineStage):
    def __init__(self, retry_policy: Any = None, adapter: Any = None, max_retries: int = 2):
        from ..recovery.policy import LinearRetryPolicy
        self.retry_policy = retry_policy or LinearRetryPolicy()
        self.adapter = adapter
        self.max_retries = max_retries

    @property
    def stage_name(self) -> str:
        return "RecoveryStage"

    def execute(self, action: Any, context: Any) -> Any:
        from ..recovery.policy import RecoveryDecision
        
        # Recovery is triggered by the pipeline catching an exception.
        if hasattr(context, "execution"):
            context.execution.retry_count += 1
            if context.execution.retry_count > self.max_retries:
                return RecoveryDecision.ABORT
            
        # Acquire fresh capture frame for diagnostics / reset
        if hasattr(self, "adapter") and self.adapter and hasattr(self.adapter, "capture_provider") and self.adapter.capture_provider:
            capture_frame = self.adapter.capture_provider.capture(context)
            if hasattr(context, "execution"):
                context.execution.state_snapshots["recovery_capture_id"] = capture_frame.capture_id
        
        # Return decision
        return RecoveryDecision.RETRY

class AuditStage(IPipelineStage):
    def __init__(self, artifact_dir: str = ".artifacts"):
        self.artifact_dir = artifact_dir

    @property
    def stage_name(self) -> str:
        return "AuditStage"

    def execute(self, action: Any, context: Any) -> Any:
        import os
        import json

        # Write actual audit artifact
        if hasattr(context, 'audit'):
            exec_id = context.execution.execution_id
            exec_dir = os.path.join(self.artifact_dir, exec_id)
            os.makedirs(exec_dir, exist_ok=True)
            log_path = os.path.join(exec_dir, "audit.json")

            log_entry: dict[str, Any] = {
                "action": str(action),
                "context": exec_id,
                "strategy": "unknown",
                "locator": None,
                "telemetry": {}
            }
            
            if hasattr(action, "target_identifier"):
                from ..models.locator import LocatorResult
                if isinstance(action.target_identifier, LocatorResult):
                    log_entry["strategy"] = action.target_identifier.strategy_used
                    log_entry["locator"] = {
                        "capture_id": action.target_identifier.capture_id,
                        "rect": str(action.target_identifier.rectangle) if action.target_identifier.rectangle else None
                    }
                else:
                    log_entry["locator"] = str(action.target_identifier)
                    
            if hasattr(context, "execution"):
                log_entry["telemetry"] = context.execution.state_snapshots.copy()

            # Simple append (reading first, then writing - simplified for trace)
            logs = []
            if os.path.exists(log_path):
                try:
                    with open(log_path, "r") as f:
                        logs = json.load(f)
                except Exception:
                    pass
            logs.append(log_entry)
            with open(log_path, "w") as f:
                json.dump(logs, f, indent=2, default=str)

            # Attach to context so the pipeline knows where it wrote
            context.execution.state_snapshots["audit_path"] = log_path

        return action