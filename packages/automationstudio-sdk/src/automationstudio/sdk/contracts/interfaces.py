"""
Core interfaces defining the Enterprise Automation Runtime boundaries.
"""
from typing import Protocol, List, Dict, Any, Optional

from pydantic import BaseModel

class AdapterCapabilities(BaseModel):
    supports_mouse: bool = False
    supports_keyboard: bool = False
    supports_accessibility: bool = False
    supports_dom: bool = False
    supports_visual: bool = False

class IAutomationAdapter(Protocol):
    """Abstracts OS and interaction platform dependencies."""
    @property
    def name(self) -> str:
        ...
        
    @property
    def capabilities(self) -> AdapterCapabilities:
        ...
        
    def execute_command(self, command: Any, context: Any) -> Any:
        ...

class IVerificationEngine(Protocol):
    """Validates the state of an application to assert success conditions."""
    def verify(self, condition: Any, context: Any) -> bool:
        ...

class IStateEngine(Protocol):
    """Captures and manages snapshots of the target application state."""
    def capture_snapshot(self) -> Any:
        ...
        
    def rollback(self, snapshot_id: str) -> bool:
        ...

class IRecoveryStrategy(Protocol):
    """Modular recovery logic when a step fails."""
    @property
    def strategy_name(self) -> str:
        ...
        
    def attempt_recovery(self, error: Exception, context: Any) -> bool:
        ...

class IPipelineStage(Protocol):
    """A pluggable stage in the execution pipeline."""
    @property
    def stage_name(self) -> str:
        ...
        
    def execute(self, action: Any, context: Any) -> Any:
        ...

class IExecutionPipeline(Protocol):
    """The central pipeline for executing a step through configured stages."""
    def add_stage(self, stage: IPipelineStage) -> None:
        ...
        
    def execute_action(self, action: Any, context: Any) -> Any:
        ...
        
    def execute_plan(self, plan: Any, context: Any) -> Any:
        ...

class ICompiler(Protocol):
    """Translates a raw Workflow into an Immutable Execution Plan."""
    def compile(self, workflow: Any) -> Any:
        ...

class IPolicyEngine(Protocol):
    """Enforces enterprise governance rules."""
    def is_permitted(self, action: Any, context: Any) -> bool:
        ...

class IAuditEngine(Protocol):
    """Records verifiable execution traces."""
    def log_event(self, event_type: str, details: Dict[str, Any], context: Any) -> None:
        ...

class ILocatorEngine(Protocol):
    """Resolves logical locators to physical bounds."""
    def locate(self, locator: Any, context: Any) -> Any:
        ...
