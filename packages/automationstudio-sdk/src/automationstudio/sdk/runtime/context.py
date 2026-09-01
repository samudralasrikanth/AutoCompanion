"""
Unified Context models for the Automation Studio execution pipeline.
Splits state into distinct scopes to prevent a God Object.
"""
from typing import Dict, Any, Optional
from pydantic import BaseModel, Field

class ExecutionContext(BaseModel):
    """Mutable runtime state associated with the current step or loop."""
    execution_id: str
    current_step_id: Optional[str] = None
    retry_count: int = 0
    state_snapshots: Dict[str, Any] = Field(default_factory=dict)
    active_capture: Optional[Any] = None

class WorkflowContext(BaseModel):
    """Metadata about the workflow being executed."""
    workflow_id: str
    workflow_name: str
    version: str

class SecurityContext(BaseModel):
    """Active identity and security tokens."""
    run_as_user: str
    domain: str
    roles: list[str] = Field(default_factory=list)

class VariableContext(BaseModel):
    """State of variables during execution."""
    global_vars: Dict[str, Any] = Field(default_factory=dict)
    workflow_vars: Dict[str, Any] = Field(default_factory=dict)
    local_vars: Dict[str, Any] = Field(default_factory=dict)
    secrets_references: Dict[str, str] = Field(default_factory=dict)

class AuditContext(BaseModel):
    """Active execution tracing context."""
    trace_id: str
    correlation_id: str
    session_recording_enabled: bool = False

class EnvironmentCapabilities(BaseModel):
    accessibility: bool = True
    native_controls: bool = True
    visual: bool = True
    ocr: bool = True
    remote_interaction: bool = False

class RuntimeContext(BaseModel):
    """Environment and platform details."""
    platform: str
    os_version: str
    resolution: str
    timezone: str
    locale: str
    capabilities: EnvironmentCapabilities = Field(default_factory=EnvironmentCapabilities)

class AutomationContext(BaseModel):
    """Aggregator of all specialized contexts. Passed through the pipeline."""
    execution: ExecutionContext
    workflow: WorkflowContext
    security: SecurityContext
    variables: VariableContext
    audit: AuditContext
    runtime: RuntimeContext
    features: Any = None # Will hold FeatureFlags
