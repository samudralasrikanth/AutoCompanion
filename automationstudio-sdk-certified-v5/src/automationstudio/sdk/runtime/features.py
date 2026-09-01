"""
Feature flag subsystem for enabling/disabling capabilities without recompilation.
"""
from pydantic import BaseModel, Field

class FeatureFlags(BaseModel):
    """Configurable flags to toggle enterprise features."""
    vision_enabled: bool = True
    ocr_enabled: bool = True
    recovery_enabled: bool = True
    diagnostics_enabled: bool = False
    audit_enabled: bool = True
    policy_enabled: bool = True
    gpu_acceleration: bool = False
    deterministic_replay: bool = False
