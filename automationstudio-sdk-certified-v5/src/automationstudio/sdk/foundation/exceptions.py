"""
Custom exception hierarchy for the Automation Studio runtime.
"""

class AutomationError(Exception):
    """Base exception for all framework errors."""
    pass

class ExecutionError(AutomationError):
    """Raised when an execution plan fails to execute."""
    pass

class ValidationError(AutomationError):
    """Raised during AST validation or state verification."""
    pass

class ElementNotFoundError(AutomationError):
    """Raised when an element cannot be located."""
    pass

class PolicyViolationError(AutomationError):
    """Raised when an action violates security or governance policies."""
    pass

class CompilationError(AutomationError):
    """Raised when a workflow cannot be compiled into an Execution Plan."""
    pass

class StaleLocatorError(AutomationError):
    """Raised when attempting to execute a physical action with a locator from an outdated capture frame."""
    pass

class AbortPipelineError(AutomationError):
    """Terminal error raised when the pipeline must immediately abort (e.g. Unsupported command).
    This exception will not be caught for retry by the RecoveryStage.
    """
    def __init__(self, reason: str, diagnostics: dict = None):
        super().__init__(reason)
        self.reason = reason
        self.diagnostics = diagnostics or {}
