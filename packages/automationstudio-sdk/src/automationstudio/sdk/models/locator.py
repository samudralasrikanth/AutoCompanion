"""
Locator result models.
"""
from typing import Dict, Any, List, Optional
from pydantic import BaseModel, Field
from ..foundation.geometry import Rectangle, CoordinateSpace

class LocatorResult(BaseModel):
    """The standardized output of the Locator Engine."""
    found: bool
    capture_id: str
    rectangle: Optional[Rectangle] = None
    coordinate_space: CoordinateSpace = CoordinateSpace.CAPTURE
    confidence: float = 0.0
    execution_time_ms: float = 0.0
    strategy_used: Optional[str] = None
    alternative_matches: List[Rectangle] = Field(default_factory=list)
    diagnostics: Dict[str, Any] = Field(default_factory=dict)

class Target(BaseModel):
    """Base class for explicit target definitions."""
    pass

class VisualTarget(Target):
    template_path: str
    threshold: float = 0.90

class OCRTarget(Target):
    text: str

class NativeTarget(Target):
    selector: str
    selector_type: str = "auto"
