"""
Diagnostics and Benchmarking for the Pipeline.
"""
import time
from typing import Dict
from pydantic import BaseModel

class PipelineMetrics(BaseModel):
    total_duration_ms: float = 0.0

    # Granular stages
    state_validation_time_ms: float = 0.0
    identification_time_ms: float = 0.0
    adapter_execution_time_ms: float = 0.0
    verification_time_ms: float = 0.0
    recovery_time_ms: float = 0.0
    audit_time_ms: float = 0.0

class Profiler:
    """Measures execution latency across boundaries."""
    def __init__(self):
        self._stage_times: Dict[str, float] = {}
        self._start_times: Dict[str, float] = {}
        self._total_start: float = 0.0

    def start(self) -> None:
        self._total_start = time.time()

    def start_stage(self, stage_name: str) -> None:
        self._start_times[stage_name] = time.time()

    def end_stage(self, stage_name: str) -> None:
        start = self._start_times.pop(stage_name, None)
        if start is not None:
            self._stage_times[stage_name] = (time.time() - start) * 1000

    def get_metrics(self) -> PipelineMetrics:
        total = (time.time() - self._total_start) * 1000 if self._total_start else 0.0
        return PipelineMetrics(
            total_duration_ms=total,
            state_validation_time_ms=self._stage_times.get("StateValidationStage", 0.0),
            identification_time_ms=self._stage_times.get("IdentificationStage", 0.0),
            adapter_execution_time_ms=self._stage_times.get("AdapterStage", 0.0),
            verification_time_ms=self._stage_times.get("VerificationStage", 0.0),
            recovery_time_ms=self._stage_times.get("RecoveryStage", 0.0),
            audit_time_ms=self._stage_times.get("AuditStage", 0.0),
        )