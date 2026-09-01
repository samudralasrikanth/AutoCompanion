"""
Execution results and telemetry.
"""
from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field
from enum import Enum

class ExecutionStatus(str, Enum):
    QUEUED = "queued"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    ABORTED = "aborted"
    NOT_SUPPORTED = "not_supported"
    TIMEOUT = "timeout"
    SKIPPED = "skipped"

class Metrics(BaseModel):
    """Telemetry metrics."""
    # Baseline comparison
    baseline_duration_ms: Optional[float] = None
    duration_variance_ms: Optional[float] = None
    regression_detected: bool = False

    # Granular timing
    locator_time_ms: float = 0.0
    ocr_time_ms: float = 0.0
    platform_time_ms: float = 0.0
    verification_time_ms: float = 0.0
    recovery_time_ms: float = 0.0
    memory_usage_mb: float = 0.0
    cpu_usage_percent: float = 0.0

class StepResult(BaseModel):
    """Result of an individual pipeline execution step."""
    action_id: str
    status: ExecutionStatus
    duration_ms: float = 0.0
    error: Optional[str] = None
    warnings: List[str] = Field(default_factory=list)
    logs: List[str] = Field(default_factory=list)
    screenshots: List[str] = Field(default_factory=list)
    metrics: Metrics = Field(default_factory=Metrics)
    recovery_attempts: int = 0
    verification_passed: bool = False

class ExecutionResult(BaseModel):
    """Comprehensive result of an entire ExecutionPlan."""
    execution_id: str
    plan_id: str
    status: ExecutionStatus
    start_time: float
    end_time: Optional[float] = None
    steps: List[StepResult] = Field(default_factory=list)
    error: Optional[str] = None
    audit_trail_id: Optional[str] = None
    artifacts: Dict[str, str] = Field(default_factory=dict) # E.g. {"screenshot_1": "/path/to/img.png"}
    overall_metrics: Metrics = Field(default_factory=Metrics)
