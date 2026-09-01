from pydantic import BaseModel, Field
from typing import Optional, Any
from ..foundation.geometry import Rectangle

class CaptureFrame(BaseModel):
    capture_id: str
    image: Any = None # Mock buffer for now
    capture_bounds: Rectangle
    surface_bounds: Rectangle
    window_bounds: Rectangle
    screen_origin: Rectangle # Using Rectangle just for x, y
    scale_factor: float = 1.0
    timestamp: float = 0.0
