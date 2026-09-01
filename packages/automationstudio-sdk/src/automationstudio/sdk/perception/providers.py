"""
Perception providers for environmental understanding (OCR, Vision, DOM, Native).
"""
from typing import Any, Protocol, List
from ..foundation.geometry import Rectangle

class IPerceptionProvider(Protocol):
    """Base provider."""
    @property
    def provider_name(self) -> str:
        ...

class IVisualProvider(IPerceptionProvider):
    """Template matching and raw pixel analysis."""
    def match_template(self, template: Any, threshold: float) -> List[Rectangle]:
        ...

class IOCRProvider(IPerceptionProvider):
    """Text extraction."""
    def extract_text(self, region: Rectangle) -> str:
        ...
    
    def find_text(self, text: str) -> List[Rectangle]:
        ...

class IAccessibilityProvider(IPerceptionProvider):
    """MSAA / UIAutomation accessibility trees."""
    def get_element_by_id(self, automation_id: str) -> Any:
        ...

class IDOMProvider(IPerceptionProvider):
    """Web elements."""
    def query_selector(self, selector: str) -> Any:
        ...

class INativeProvider(IPerceptionProvider):
    """Win32 / SAP Control trees."""
    def get_control(self, class_name: str, instance: int) -> Any:
        ...
