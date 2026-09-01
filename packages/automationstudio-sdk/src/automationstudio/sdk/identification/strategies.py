"""
Object Identification Strategies.
"""
from typing import Any, List
from ..models.locator import LocatorResult

class IdentificationStrategy:
    """Base strategy for resolving an object to a physical location."""
    @property
    def name(self) -> str:
        return self.__class__.__name__

    def identify(self, target: Any, context: Any, capture_frame: Any = None) -> LocatorResult:
        raise NotImplementedError

class VisualStrategy(IdentificationStrategy):
    required_capability = "visual"
    def __init__(self, provider: Any = None):
        pass

    def identify(self, target: Any, context: Any, capture_frame: Any = None) -> LocatorResult:
        from ..foundation.geometry import Rectangle
        
        if isinstance(target, dict):
            template_path = target.get("template_path")
            threshold = target.get("threshold", 0.90)
        else:
            template_path = getattr(target, "template_path", target if isinstance(target, str) else None)
            threshold = getattr(target, "threshold", 0.90)

        if not template_path:
            return LocatorResult(found=False, capture_id="none", strategy_used=self.name)

        if capture_frame and getattr(capture_frame, "image", None) is not None:
            try:
                from .perception import match_template
                match = match_template(capture_frame.image, template_path, threshold)
                if match:
                    rect_dict = match["rectangle"]
                    return LocatorResult(
                        found=True,
                        rectangle=Rectangle(x=rect_dict["x"], y=rect_dict["y"], w=rect_dict["w"], h=rect_dict["h"]),
                        strategy_used=self.name,
                        capture_id=capture_frame.capture_id,
                        confidence=match["confidence"],
                        diagnostics={"method": "template_match", "capture_id": capture_frame.capture_id}
                    )
            except ImportError as e:
                raise NotImplementedError(f"Visual perception dependencies not available: {e}")
            except Exception as e:
                return LocatorResult(found=False, capture_id=getattr(capture_frame, "capture_id", "none"), strategy_used=self.name, diagnostics={"error": str(e)})

        return LocatorResult(found=False, capture_id="none", strategy_used=self.name, diagnostics={"error": "No capture frame or image available for visual perception"})

class OCRStrategy(IdentificationStrategy):
    required_capability = "ocr"
    def __init__(self, provider: Any = None):
        pass

    def identify(self, target: Any, context: Any, capture_frame: Any = None) -> LocatorResult:
        from ..foundation.geometry import Rectangle

        if isinstance(target, dict):
            text = target.get("text")
        else:
            text = getattr(target, "text", target if isinstance(target, str) else None)
        if not text:
            return LocatorResult(found=False, capture_id="none", strategy_used=self.name)

        if capture_frame and getattr(capture_frame, "image", None) is not None:
            try:
                from .perception import find_text_ocr
                match = find_text_ocr(capture_frame.image, text)
                if match:
                    rect_dict = match["rectangle"]
                    return LocatorResult(
                        found=True,
                        rectangle=Rectangle(x=rect_dict["x"], y=rect_dict["y"], w=rect_dict["w"], h=rect_dict["h"]),
                        strategy_used=self.name,
                        capture_id=capture_frame.capture_id,
                        confidence=match["confidence"],
                        diagnostics={"text": text, "capture_id": capture_frame.capture_id}
                    )
            except ImportError as e:
                raise NotImplementedError(f"OCR perception dependencies not available: {e}")
            except Exception as e:
                return LocatorResult(found=False, capture_id=getattr(capture_frame, "capture_id", "none"), strategy_used=self.name, diagnostics={"error": str(e)})

        return LocatorResult(found=False, capture_id="none", strategy_used=self.name, diagnostics={"error": "No capture frame or image available for OCR perception"})

class DOMStrategy(IdentificationStrategy):
    def __init__(self, provider: Any = None):
        self.provider = provider

    def identify(self, target: Any, context: Any, capture_frame: Any = None) -> LocatorResult:
        if self.provider is None:
            return LocatorResult(found=False, capture_id="none", strategy_used=self.name)
        result = self.provider.find(target)
        if result is None:
            return LocatorResult(found=False, capture_id="none", strategy_used=self.name)
        return LocatorResult(found=True, capture_id="native_capture", rectangle=result.get("rectangle"), strategy_used=self.name)

class AccessibilityStrategy(IdentificationStrategy):
    required_capability = "accessibility"
    def __init__(self, provider: Any = None):
        self.provider = provider

    def identify(self, target: Any, context: Any, capture_frame: Any = None) -> LocatorResult:
        if self.provider is None:
            return LocatorResult(found=False, capture_id="none", strategy_used=self.name)
        elem = self.provider.find_element(target)
        if elem:
            return LocatorResult(found=True, capture_id="native_capture", bounds={"x": 0, "y": 0, "w": 100, "h": 50}, strategy_used=self.name)
        return LocatorResult(found=False, capture_id="none", strategy_used=self.name)

class NativeStrategy(IdentificationStrategy):
    required_capability = "native_controls"
    def __init__(self, provider: Any = None):
        self.provider = provider

    def identify(self, target: Any, context: Any, capture_frame: Any = None) -> LocatorResult:
        if self.provider is None:
            return LocatorResult(found=False, capture_id="none", strategy_used=self.name)
        result = self.provider.find(target)
        if result is None:
            return LocatorResult(found=False, capture_id="none", strategy_used=self.name)
        return LocatorResult(found=True, capture_id="accessibility_capture", rectangle=result.get("rectangle"), strategy_used=self.name)
