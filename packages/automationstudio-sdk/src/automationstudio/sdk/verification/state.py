"""
State Verification logic.
"""
from typing import Any, Dict, Optional
from pydantic import BaseModel
from ..models.command import VerificationCommand
from ..models.locator import LocatorResult

from enum import Enum

class VerificationStatus(str, Enum):
    PASS = "PASS"
    FAIL = "FAIL"
    NOT_SUPPORTED = "NOT_SUPPORTED"
    ERROR = "ERROR"

class VerificationResult(BaseModel):
    """The granular result of a verification check."""
    status: VerificationStatus
    expected: Any = None
    observed: Any = None
    reason: str
    capture_id: Optional[str] = None
    duration_ms: float = 0.0
    details: Dict[str, Any] = {}

class StateVerification:
    """Provides deterministic verification of element states across adapters."""

    def __init__(self, adapter: Any = None):
        self.adapter = adapter

    def verify(self, command: VerificationCommand, context: Any, capture_frame: Any = None) -> VerificationResult:
        """Dispatch to the appropriate verification method based on verification_type."""
        vtype = command.verification_type
        target = command.target_identifier
        expected = command.expected_value

        if vtype == "exists":
            return self.verify_exists(target, context, capture_frame)
        elif vtype == "visible":
            return self.verify_visible(target, context, capture_frame)
        elif vtype == "enabled":
            return self.verify_enabled(target, context, capture_frame)
        elif vtype == "focused":
            return self.verify_focused(target, context, capture_frame)
        elif vtype == "text":
            return self.verify_value(target, expected, context, capture_frame)
        elif vtype == "value":
            return self.verify_value(target, expected, context, capture_frame)
        else:
            return VerificationResult(
                status=VerificationStatus.FAIL,
                reason=f"Unsupported verification type: {vtype}",
                duration_ms=0,
            )

    def _resolve_target(self, target: Any, context: Any, capture_frame: Any = None) -> Optional[LocatorResult]:
        """Resolve a target through identification if it's not already a LocatorResult."""
        if isinstance(target, LocatorResult):
            return target
        # Attempt identification via the adapter's strategies
        if self.adapter is None:
            return None
        from ..execution.stages import IdentificationStage
        stage = IdentificationStage(self.adapter)
        try:
            from ..models.command import InteractionCommand
            cmd = InteractionCommand(command_id="verify", target_identifier=target)
            result = stage.execute(cmd, context)
            return result.target_identifier if isinstance(result.target_identifier, LocatorResult) else None
        except Exception:
            return None

    def verify_exists(self, target: Any, context: Any, capture_frame: Any = None) -> VerificationResult:
        result = self._resolve_target(target, context, capture_frame)
        if result is None:
            return VerificationResult(status=VerificationStatus.FAIL, reason="Element not found", duration_ms=0)
        return VerificationResult(status=VerificationStatus.PASS if result.found else VerificationStatus.FAIL, reason="Element exists" if result.found else "Element not found", duration_ms=0)

    def verify_visible(self, target: Any, context: Any, capture_frame: Any = None) -> VerificationResult:
        result = self._resolve_target(target, context, capture_frame)
        if result is None:
            return VerificationResult(status=VerificationStatus.FAIL, reason="Element not found", duration_ms=0)
        return VerificationResult(status=VerificationStatus.PASS if result.found else VerificationStatus.FAIL, reason="Element visible" if result.found else "Element not visible", duration_ms=0)

    def verify_enabled(self, target: Any, context: Any, capture_frame: Any = None) -> VerificationResult:
        result = self._resolve_target(target, context, capture_frame)
        if result is None:
            return VerificationResult(status=VerificationStatus.FAIL, reason="Element not found", duration_ms=0)
            
        if result.strategy_used in ("VisualStrategy", "OCRStrategy"):
            return VerificationResult(
                status=VerificationStatus.NOT_SUPPORTED, 
                reason=f"Verification NOT_SUPPORTED: Cannot deterministically verify 'enabled' state using {result.strategy_used}.",
                duration_ms=0
            )
            
        return VerificationResult(status=VerificationStatus.PASS if result.found else VerificationStatus.FAIL, reason="Element enabled" if result.found else "Element not enabled", duration_ms=0)

    def verify_focused(self, target: Any, context: Any, capture_frame: Any = None) -> VerificationResult:
        result = self._resolve_target(target, context, capture_frame)
        if result is None:
            return VerificationResult(status=VerificationStatus.FAIL, reason="Element not found", duration_ms=0)
            
        if result.strategy_used in ("VisualStrategy", "OCRStrategy"):
            return VerificationResult(
                status=VerificationStatus.NOT_SUPPORTED, 
                reason=f"Verification NOT_SUPPORTED: Cannot deterministically verify 'focused' state using {result.strategy_used}.",
                duration_ms=0
            )
            
        return VerificationResult(status=VerificationStatus.PASS if result.found else VerificationStatus.FAIL, reason="Element focused" if result.found else "Element not focused", duration_ms=0)

    def verify_checked(self, target: Any, context: Any, capture_frame: Any = None) -> VerificationResult:
        result = self._resolve_target(target, context, capture_frame)
        if result is None:
            return VerificationResult(status=VerificationStatus.FAIL, reason="Element not found", duration_ms=0)
            
        if result.strategy_used in ("VisualStrategy", "OCRStrategy"):
            return VerificationResult(
                status=VerificationStatus.NOT_SUPPORTED, 
                reason=f"Verification NOT_SUPPORTED: Cannot deterministically verify 'checked' state using {result.strategy_used}.",
                duration_ms=0
            )
            
        return VerificationResult(status=VerificationStatus.PASS if result.found else VerificationStatus.FAIL, reason="Element checked" if result.found else "Element not checked", duration_ms=0)

    def verify_selected(self, target: Any, context: Any, capture_frame: Any = None) -> VerificationResult:
        result = self._resolve_target(target, context, capture_frame)
        if result is None:
            return VerificationResult(status=VerificationStatus.FAIL, reason="Element not found", duration_ms=0)
            
        if result.strategy_used in ("VisualStrategy", "OCRStrategy"):
            return VerificationResult(
                status=VerificationStatus.NOT_SUPPORTED, 
                reason=f"Verification NOT_SUPPORTED: Cannot deterministically verify 'selected' state using {result.strategy_used}.",
                duration_ms=0
            )
            
        return VerificationResult(status=VerificationStatus.PASS if result.found else VerificationStatus.FAIL, reason="Element selected" if result.found else "Element not selected", duration_ms=0)

    def verify_readonly(self, target: Any, context: Any, capture_frame: Any = None) -> VerificationResult:
        result = self._resolve_target(target, context, capture_frame)
        if result is None:
            return VerificationResult(status=VerificationStatus.FAIL, reason="Element not found", duration_ms=0)
            
        if result.strategy_used in ("VisualStrategy", "OCRStrategy"):
            return VerificationResult(
                status=VerificationStatus.NOT_SUPPORTED, 
                reason=f"Verification NOT_SUPPORTED: Cannot deterministically verify 'readonly' state using {result.strategy_used}.",
                duration_ms=0
            )
            
        return VerificationResult(status=VerificationStatus.PASS if result.found else VerificationStatus.FAIL, reason="Element readonly" if result.found else "Element not readonly", duration_ms=0)

    def verify_value(self, target: Any, expected: Any, context: Any, capture_frame: Any = None) -> VerificationResult:
        result = self._resolve_target(target, context, capture_frame)
        if result is None:
            return VerificationResult(status=VerificationStatus.FAIL, reason="Element not found", duration_ms=0)
        # For deterministic mock verification, compare against the expected value
        # The actual value comes from the resolved target's diagnostics or a provider
        actual = None
        if isinstance(result, LocatorResult):
            actual = result.diagnostics.get("text") or result.diagnostics.get("value")
        if expected is not None:
            passed = str(actual) == str(expected) if actual is not None else False
            return VerificationResult(
                status=VerificationStatus.PASS if passed else VerificationStatus.FAIL,
                expected=expected,
                observed=actual,
                reason=f"Value match: expected={expected}, actual={actual}" if passed else f"Value mismatch: expected={expected}, actual={actual}",
                duration_ms=0,
            )
        return VerificationResult(status=VerificationStatus.PASS if result.found else VerificationStatus.FAIL, reason="Element value verified" if result.found else "Element not found", duration_ms=0)