"""
Mock Providers for Execution Tracing on macOS.
"""
from .providers import (
    IInputProvider, IWindowProvider, IProcessProvider, 
    IClipboardProvider, ICaptureProvider, IAccessibilityProvider
)
from typing import Any, List

class MockInputProvider(IInputProvider):
    def click(self, x: int, y: int) -> None: pass
    def double_click(self, x: int, y: int) -> None: pass
    def move(self, x: int, y: int) -> None: pass
    def type_text(self, text: str) -> None: pass
    def press(self, key: str) -> None: pass
    def hotkey(self, keys: List[str]) -> None: pass

class MockWindowProvider(IWindowProvider):
    def find(self, title: str) -> str: return "mock_window_id"
    def activate(self, window_id: str) -> None: pass
    def close(self, window_id: str) -> None: pass
    def wait(self, title: str, timeout_ms: int = 5000) -> str: return "mock_window_id"
    def exists(self, title: str) -> bool: return True

class MockProcessProvider(IProcessProvider):
    def launch(self, path: str, args: str = "") -> str: return "mock_process_id"
    def kill(self, process_id: str) -> None: pass
    def exists(self, process_id: str) -> bool: return True
    def get_process(self, process_id: str) -> Any: return None

class MockAccessibilityProvider(IAccessibilityProvider):
    # This will be tested for Verification/Identification logic.
    def __init__(self, should_fail: bool = False):
        self.should_fail = should_fail
        
    def find_element(self, conditions: Any) -> Any:
        if self.should_fail:
            return None
        return {"id": "mock_element", "type": "TextEditor", "name": "TextEditor"}
        
    def invoke_pattern(self, element: Any, pattern: str) -> None:
        pass
