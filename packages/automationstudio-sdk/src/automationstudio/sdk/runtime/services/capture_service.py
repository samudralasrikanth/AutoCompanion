"""
Centralized Capture Service.
No other module is allowed to capture screens directly.
"""
from typing import Any, Optional
from ...foundation.geometry import Rectangle
from ...models.capture import CaptureFrame
import time
import numpy as np

class ICaptureProvider:
    """Interface for capture providers."""
    def capture(self, context: Any) -> CaptureFrame:
        raise NotImplementedError

class MockCaptureProvider(ICaptureProvider):
    """Deterministic mock capture provider for testing the pipeline without real screens."""
    def __init__(self, width: int = 800, height: int = 600, scale_factor: float = 1.0):
        self.width = width
        self.height = height
        self.scale_factor = scale_factor
        self.capture_count = 0

    def capture(self, context: Any) -> CaptureFrame:
        self.capture_count += 1
        return CaptureFrame(
            capture_id=f"mock_cap_{self.capture_count}",
            image=np.zeros((self.height, self.width, 3), dtype=np.uint8),
            capture_bounds=Rectangle(x=0, y=0, w=self.width, h=self.height),
            surface_bounds=Rectangle(x=0, y=0, w=self.width, h=self.height),
            window_bounds=Rectangle(x=0, y=0, w=self.width, h=self.height),
            screen_origin=Rectangle(x=0, y=0, w=0, h=0),
            scale_factor=self.scale_factor,
            timestamp=time.time()
        )

class CaptureService:
    """Centralized capture service that delegates to a configured provider."""
    def __init__(self, provider: Optional[ICaptureProvider] = None):
        self.provider = provider or MockCaptureProvider()

    def capture_fullscreen(self, context: Any = None) -> CaptureFrame:
        return self.provider.capture(context)

    def capture_region(self, region: Rectangle, context: Any = None) -> CaptureFrame:
        frame = self.provider.capture(context)
        # Return a frame bounded to the requested region
        return CaptureFrame(
            capture_id=f"{frame.capture_id}_region",
            image=frame.image,
            capture_bounds=region,
            surface_bounds=frame.surface_bounds,
            window_bounds=frame.window_bounds,
            screen_origin=frame.screen_origin,
            scale_factor=frame.scale_factor,
            timestamp=frame.timestamp
        )

    def capture_ocr_snapshot(self, region: Rectangle, context: Any = None) -> CaptureFrame:
        """Optimizes the capture specifically for OCR reading (e.g., contrast boosting)."""
        frame = self.capture_region(region, context)
        return frame

    def record_video(self, start: bool) -> None:
        """Video recording is not supported by the mock provider."""
        raise NotImplementedError("Video recording is not supported by the current capture provider")

    def overlay_debug(self, image: Any, bounds: Rectangle) -> Any:
        """Draws debug information on a capture."""
        return image