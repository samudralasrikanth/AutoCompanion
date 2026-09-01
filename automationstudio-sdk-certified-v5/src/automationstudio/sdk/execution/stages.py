"""Deterministic, domain-specific stages for Surface execution."""
from typing import Any
import json
import os
import time

from ..contracts.interfaces import IPipelineStage
from ..foundation.exceptions import AbortPipelineError, ElementNotFoundError, StaleLocatorError, ValidationError
from ..models.command import KeyboardCommand, MouseCommand, NavigationCommand, VerificationCommand
from ..models.locator import LocatorResult
from ..models.workflow import ASTNode


class StateValidationStage(IPipelineStage):
    @property
    def stage_name(self) -> str:
        return "StateValidationStage"

    def execute(self, action: Any, context: Any) -> Any:
        if isinstance(action, ASTNode) and not action.node_type:
            raise ValidationError("Action node has no type")
        return action


class CommandTranslationStage(IPipelineStage):
    """Translate declarative AST nodes into typed physical commands."""
    @property
    def stage_name(self) -> str:
        return "CommandTranslationStage"

    def _parse_target(self, target_data: Any) -> Any:
        from ..models.locator import LocatorDefinition, NativeTarget, OCRTarget, SurfaceTarget, VisualTarget
        if isinstance(target_data, dict):
            if "locators" in target_data:
                return SurfaceTarget(
                    locators=[LocatorDefinition(**locator) for locator in target_data.get("locators", [])],
                    window_title=target_data.get("window_title"),
                )
            target_type = target_data.get("type")
            if target_type == "image":
                return VisualTarget(template_path=target_data.get("template", ""), threshold=target_data.get("threshold", 0.90))
            if target_type == "ocr":
                return OCRTarget(text=target_data.get("text", ""))
            if target_type == "native":
                return NativeTarget(selector=target_data.get("selector", ""), selector_type=target_data.get("selector_type", "auto"))
            if target_type == "coordinate":
                return {"type": "coordinate", "value": target_data.get("value")}
        return target_data

    def execute(self, action: Any, context: Any) -> Any:
        if not hasattr(action, "node_type"):
            return action
        node_type = action.node_type
        params = getattr(action, "parameters", {})
        metadata = {"surface": params.get("surface", {})} if isinstance(params.get("surface"), dict) else {}
        target = self._parse_target(params.get("target") or params.get("title"))

        if node_type == "click":
            return MouseCommand(command_id=action.node_id, action="click", target_identifier=target, metadata=metadata)
        if node_type == "type":
            return KeyboardCommand(command_id=action.node_id, action="type", target_identifier=target, text=params.get("text"), metadata=metadata)
        if node_type in ("launch", "close", "wait_for_window"):
            return NavigationCommand(command_id=action.node_id, action=node_type, target_identifier=target, metadata=metadata)
        if node_type == "verify":
            return VerificationCommand(
                command_id=action.node_id,
                verification_type=params.get("state", "exists"),
                expected_value=params.get("expected"),
                target_identifier=target,
                metadata=metadata,
            )
        return action


class SurfaceWaitStage(IPipelineStage):
    """Poll explicit Surface conditions before or after an action."""
    def __init__(self, adapter: Any = None, phase: str = "before"):
        self.adapter = adapter
        self.phase = phase

    @property
    def stage_name(self) -> str:
        return f"SurfaceWaitStage[{self.phase}]"

    def _check_window(self, expected: str, context: Any) -> bool:
        if not expected or self.adapter is None:
            return False
        provider = getattr(self.adapter, "window_provider", None)
        if provider is not None and hasattr(provider, "exists"):
            return bool(provider.exists(expected))
        session = getattr(self.adapter, "session_provider", None)
        if session is not None and hasattr(session, "attach"):
            try:
                session.attach(expected)
                return True
            except Exception:
                return False
        return False

    def _check_element(self, target: Any, condition: str, expected: Any, context: Any) -> bool:
        from ..verification.state import StateVerification, VerificationStatus
        command = VerificationCommand(
            command_id="wait",
            verification_type="text" if condition == "ocr" else "exists",
            expected_value=expected,
            target_identifier=target,
        )
        result = StateVerification(self.adapter).verify(command, context, getattr(context.execution, "active_capture", None))
        return result.status == VerificationStatus.PASS

    def execute(self, action: Any, context: Any) -> Any:
        policy = getattr(action, "metadata", {}).get("surface", {}).get("wait_" + self.phase)
        if not policy:
            return action
        condition = policy.get("condition", "element")
        timeout_ms = max(0, int(policy.get("timeoutMs", 5000)))
        interval_ms = max(1, int(policy.get("intervalMs", 200)))
        expected = policy.get("expected")
        target = getattr(action, "target_identifier", None)
        deadline = time.monotonic() + timeout_ms / 1000.0

        while True:
            if condition == "settle":
                if timeout_ms:
                    time.sleep(timeout_ms / 1000.0)
                return action
            passed = self._check_window(expected, context) if condition == "window" else self._check_element(target, condition, expected, context)
            if passed:
                return action
            if time.monotonic() >= deadline:
                raise ValidationError(f"Surface wait timed out: condition={condition}, expected={expected}")
            time.sleep(interval_ms / 1000.0)


class IdentificationStage(IPipelineStage):
    """Select explicit Surface evidence in stable priority order."""
    PRIORITY = {"uia": 10, "accessibility": 20, "native": 30, "ocr": 40, "image": 50, "anchor": 60, "relative": 70, "coordinate": 80}

    def __init__(self, adapter: Any = None):
        self.adapter = adapter
        from ..identification.strategies import AccessibilityStrategy, CoordinateStrategy, NativeStrategy, OCRStrategy, VisualStrategy
        self.strategies = {
            "uia": AccessibilityStrategy(getattr(adapter, "accessibility_provider", None)),
            "accessibility": AccessibilityStrategy(getattr(adapter, "accessibility_provider", None)),
            "native": NativeStrategy(getattr(adapter, "native_provider", None)),
            "ocr": OCRStrategy(getattr(adapter, "ocr_provider", None)),
            "image": VisualStrategy(getattr(adapter, "visual_provider", None)),
            "coordinate": CoordinateStrategy(),
        }
        self.legacy_strategies = [
            self.strategies["accessibility"],
            self.strategies["native"],
            self.strategies["image"],
            self.strategies["ocr"],
        ]

    @property
    def stage_name(self) -> str:
        return "IdentificationStage"

    def _capture(self, context: Any) -> Any:
        provider = getattr(self.adapter, "capture_provider", None) if self.adapter else None
        if provider is None:
            return None
        frame = provider.capture(context)
        context.execution.active_capture = frame
        context.execution.state_snapshots["last_capture_id"] = frame.capture_id
        return frame

    def _capability_available(self, strategy: Any, context: Any) -> bool:
        capability = getattr(strategy, "required_capability", None)
        capabilities = getattr(getattr(context, "runtime", None), "capabilities", None)
        return not capability or capabilities is None or bool(getattr(capabilities, capability, True))

    def _run(self, strategy: Any, target: Any, context: Any, capture: Any) -> LocatorResult:
        return strategy.identify(target, context, capture_frame=capture)

    def _surface_target(self, action: Any, context: Any, capture: Any) -> Any:
        from ..models.locator import NativeTarget, OCRTarget, SurfaceTarget, VisualTarget
        target = action.target_identifier
        candidates = sorted(
            enumerate(target.locators),
            key=lambda item: (item[1].priority if item[1].priority is not None else self.PRIORITY.get(item[1].type, 999), item[0]),
        )
        diagnostics = []
        for _, candidate in candidates:
            strategy = self.strategies.get(candidate.type)
            if strategy is None:
                diagnostics.append(f"{candidate.type}: SKIPPED - unsupported strategy")
                continue
            if not self._capability_available(strategy, context):
                diagnostics.append(f"{strategy.name}: SKIPPED - capability unavailable")
                continue
            if candidate.type in ("image", "ocr"):
                strategy_target = VisualTarget(template_path=str(candidate.value)) if candidate.type == "image" else OCRTarget(text=str(candidate.value))
            elif candidate.type in ("native", "uia", "accessibility"):
                strategy_target = NativeTarget(selector=str(candidate.value), selector_type=candidate.type)
            else:
                strategy_target = {"type": candidate.type, "value": candidate.value, "region": candidate.region}
            result = self._run(strategy, strategy_target, context, capture)
            if result.found:
                result.diagnostics["candidate_strategy"] = candidate.type
                context.execution.state_snapshots["last_strategy"] = result.strategy_used
                diagnostics.append(f"{strategy.name}: FOUND")
                context.execution.state_snapshots["identification_diagnostics"] = diagnostics
                action.target_identifier = result
                return action
            diagnostics.append(f"{strategy.name}: NOT_FOUND")
        context.execution.state_snapshots["identification_diagnostics"] = diagnostics
        raise ElementNotFoundError(f"Identification Failure: Element not found by any strategy. Diagnostics: {diagnostics}")

    def execute(self, action: Any, context: Any) -> Any:
        if not isinstance(action, (MouseCommand, KeyboardCommand, VerificationCommand)):
            return action
        if not getattr(action, "target_identifier", None):
            return action
        capture = self._capture(context)
        if action.target_identifier.__class__.__name__ == "SurfaceTarget":
            return self._surface_target(action, context, capture)

        diagnostics = []
        capabilities = getattr(getattr(context, "runtime", None), "capabilities", None)
        for strategy in self.legacy_strategies:
            capability = getattr(strategy, "required_capability", None)
            if capability and capabilities is not None and not getattr(capabilities, capability, True):
                diagnostics.append(f"{strategy.name}: SKIPPED - reason = '{capability} capability unavailable in current environment'")
                continue
            result = self._run(strategy, action.target_identifier, context, capture)
            diagnostics.append(f"{strategy.name}: EXECUTED - result = {'FOUND' if result.found else 'NOT_FOUND'}")
            if result.found:
                context.execution.state_snapshots["identification_diagnostics"] = diagnostics
                context.execution.state_snapshots["last_strategy"] = result.strategy_used
                action.target_identifier = result
                return action
        context.execution.state_snapshots["identification_diagnostics"] = diagnostics
        raise ElementNotFoundError(f"Identification Failure: Element not found by any strategy. Diagnostics: {diagnostics}")


class AdapterStage(IPipelineStage):
    def __init__(self, adapter: Any = None):
        self.adapter = adapter

    @property
    def stage_name(self) -> str:
        return "AdapterStage"

    def execute(self, action: Any, context: Any) -> Any:
        target = getattr(action, "target_identifier", None)
        if isinstance(target, LocatorResult):
            last_capture_id = context.execution.state_snapshots.get("last_capture_id")
            if target.capture_id and last_capture_id and target.capture_id != last_capture_id:
                raise StaleLocatorError(f"Locator capture_id '{target.capture_id}' does not match active capture_id '{last_capture_id}'")
        if self.adapter is None:
            action.provider = "NoAdapter"
            return action
        try:
            result = self.adapter.execute_command(action, context)
            if isinstance(result, dict):
                action.provider = result.get("provider")
                if result.get("status") == "NOT_SUPPORTED":
                    raise AbortPipelineError(f"Command not supported by adapter: {action}")
            return action
        except NotImplementedError as error:
            raise AbortPipelineError(str(error))


class VerificationStage(IPipelineStage):
    def __init__(self, adapter: Any = None):
        self.adapter = adapter

    @property
    def stage_name(self) -> str:
        return "VerificationStage"

    def execute(self, action: Any, context: Any) -> Any:
        policy = getattr(action, "metadata", {}).get("surface", {}).get("verify_after")
        command = action if isinstance(action, VerificationCommand) else None
        if command is None and policy:
            condition = policy.get("condition", "exists")
            command = VerificationCommand(
                command_id=getattr(action, "command_id", "verify"),
                verification_type=condition,
                expected_value=policy.get("expected"),
                target_identifier=getattr(action, "target_identifier", None),
            )
        if command is None:
            return action
        capture = getattr(context.execution, "active_capture", None)
        if self.adapter is not None and getattr(self.adapter, "capture_provider", None) is not None:
            capture = self.adapter.capture_provider.capture(context)
            context.execution.state_snapshots["verification_capture_id"] = capture.capture_id
        from ..verification.state import StateVerification, VerificationStatus
        result = StateVerification(self.adapter).verify(command, context, capture)
        context.execution.state_snapshots["verification"] = {"status": result.status.value, "reason": result.reason}
        if result.status != VerificationStatus.PASS:
            raise ValidationError(f"Verification FAIL: {result.reason}")
        return action


class RecoveryStage(IPipelineStage):
    def __init__(self, retry_policy: Any = None, adapter: Any = None, max_retries: int = 2):
        self.adapter = adapter
        self.max_retries = max(0, int(max_retries))

    @property
    def stage_name(self) -> str:
        return "RecoveryStage"

    def execute(self, action: Any, context: Any) -> Any:
        from ..recovery.policy import RecoveryDecision
        parameters = getattr(action, "parameters", {}) or {}
        policy = parameters.get("surface", {}).get("recovery", {}) if isinstance(parameters.get("surface"), dict) else {}
        max_retries = max(0, int(policy.get("maxAttempts", self.max_retries))) if isinstance(policy, dict) else self.max_retries
        context.execution.retry_count += 1
        if context.execution.retry_count > max_retries:
            return RecoveryDecision.ABORT
        if policy.get("refreshWindow") and self.adapter is not None:
            session = getattr(self.adapter, "session_provider", None)
            title = parameters.get("surface", {}).get("window_title")
            if session is not None and title:
                session.attach(title)
        if self.adapter is not None and getattr(self.adapter, "capture_provider", None) is not None:
            frame = self.adapter.capture_provider.capture(context)
            context.execution.active_capture = frame
            context.execution.state_snapshots["recovery_capture_id"] = frame.capture_id
        context.execution.state_snapshots["recovery_attempt"] = context.execution.retry_count
        return RecoveryDecision.RETRY


class AuditStage(IPipelineStage):
    def __init__(self, artifact_dir: str = ".artifacts"):
        self.artifact_dir = artifact_dir

    @property
    def stage_name(self) -> str:
        return "AuditStage"

    def execute(self, action: Any, context: Any) -> Any:
        exec_id = context.execution.execution_id
        exec_dir = os.path.join(self.artifact_dir, exec_id)
        os.makedirs(exec_dir, exist_ok=True)
        log_path = os.path.join(exec_dir, "audit.json")
        target = getattr(action, "target_identifier", None)
        locator = None
        if isinstance(target, LocatorResult):
            locator = {"capture_id": target.capture_id, "strategy": target.strategy_used, "rect": target.rectangle.model_dump() if target.rectangle else None}
        elif target is not None:
            locator = str(target)
        entry = {
            "action": str(action),
            "action_id": getattr(action, "command_id", None),
            "context": exec_id,
            "strategy": getattr(target, "strategy_used", None),
            "locator": locator,
            "telemetry": context.execution.state_snapshots.copy(),
            "trace": context.execution.state_snapshots.get("current_trace", []),
        }
        logs = []
        if os.path.exists(log_path):
            try:
                with open(log_path, "r", encoding="utf-8") as handle:
                    logs = json.load(handle)
            except (OSError, ValueError):
                logs = []
        logs.append(entry)
        with open(log_path, "w", encoding="utf-8") as handle:
            json.dump(logs, handle, indent=2, default=str)
        context.execution.state_snapshots["audit_path"] = log_path
        return action
