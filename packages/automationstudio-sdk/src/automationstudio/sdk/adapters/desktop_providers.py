"""
Desktop (Win32) concrete providers.
"""
import sys
from typing import Any
from .providers import IInputProvider
from ..runtime.services.capture_service import ICaptureProvider
from ..models.capture import CaptureFrame

class DesktopInputProvider(IInputProvider):
    def click(self, x: int, y: int) -> None:
        if sys.platform != "win32":
            raise NotImplementedError("DesktopInputProvider requires Win32")
        # TODO: Phase 4
        pass

    def type_text(self, text: str) -> None:
        if sys.platform != "win32":
            raise NotImplementedError("DesktopInputProvider requires Win32")
        # TODO: Phase 4
        pass

class DesktopCaptureProvider(ICaptureProvider):
    def capture(self, context: Any) -> CaptureFrame:
        if sys.platform != "win32":
            raise NotImplementedError("DesktopCaptureProvider requires Win32")
        # TODO: Phase 4
        return None
