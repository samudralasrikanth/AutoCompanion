"""
Enterprise Synchronization Framework.
Replaces raw sleeps and generic timeouts with deterministic polling.
"""
import time
from typing import Any, Callable

class WaitCondition:
    """Base class for all synchronization logic."""
    def __init__(self, poll_interval_ms: float = 200):
        self.poll_interval_ms = poll_interval_ms

    def _check(self, context: Any) -> bool:
        raise NotImplementedError

    def wait(self, timeout_ms: int, context: Any) -> bool:
        """Poll until condition is met or timeout expires."""
        deadline = time.time() + (timeout_ms / 1000.0)
        while time.time() < deadline:
            if self._check(context):
                return True
            time.sleep(self.poll_interval_ms / 1000.0)
        return False

class WaitForWindow(WaitCondition):
    def __init__(self, title: str, poll_interval_ms: float = 200):
        super().__init__(poll_interval_ms)
        self.title = title

    def _check(self, context: Any) -> bool:
        adapter = getattr(context, "adapter", None)
        if adapter is None or not hasattr(adapter, "window_provider"):
            return False
        return bool(adapter.window_provider.exists(self.title))

class WaitForImage(WaitCondition):
    def __init__(self, image: Any, poll_interval_ms: float = 200):
        super().__init__(poll_interval_ms)
        self.image = image

    def _check(self, context: Any) -> bool:
        adapter = getattr(context, "adapter", None)
        if adapter is None or not hasattr(adapter, "visual_provider"):
            return False
        result = adapter.visual_provider.find(self.image)
        return True if result is not None else False

class WaitForOCR(WaitCondition):
    def __init__(self, text: str, poll_interval_ms: float = 200):
        super().__init__(poll_interval_ms)
        self.text = text

    def _check(self, context: Any) -> bool:
        adapter = getattr(context, "adapter", None)
        if adapter is None or not hasattr(adapter, "ocr_provider"):
            return False
        result = adapter.ocr_provider.find(self.text)
        return True if result is not None else False

class WaitForDOM(WaitCondition):
    def __init__(self, selector: str, poll_interval_ms: float = 200):
        super().__init__(poll_interval_ms)
        self.selector = selector

    def _check(self, context: Any) -> bool:
        adapter = getattr(context, "adapter", None)
        if adapter is None or not hasattr(adapter, "dom_provider"):
            return False
        result = adapter.dom_provider.find(self.selector)
        return True if result is not None else False

class WaitForAPI(WaitCondition):
    def __init__(self, predicate: Callable[[], bool], poll_interval_ms: float = 200):
        super().__init__(poll_interval_ms)
        self.predicate = predicate

    def _check(self, context: Any) -> bool:
        return self.predicate()

class WaitForClipboard(WaitCondition):
    def __init__(self, expected_text: str, poll_interval_ms: float = 200):
        super().__init__(poll_interval_ms)
        self.expected_text = expected_text

    def _check(self, context: Any) -> bool:
        adapter = getattr(context, "adapter", None)
        if adapter is None or not hasattr(adapter, "clipboard_provider"):
            return False
        return bool(adapter.clipboard_provider.get() == self.expected_text)
