"""
Browser automation provider interfaces.
"""
from abc import ABC, abstractmethod
from typing import Any, Optional, Dict, List
from ...models.browser import (
    BrowserSession, 
    BrowserTab, 
    BrowserFrame, 
    DomElement, 
    BrowserCaptureFrame,
)

class BrowserSessionProvider(ABC):
    """Manages browser sessions, tabs, frames, and generation lifecycle."""
    
    @abstractmethod
    def launch(self, browser_type: str, headless: bool = True) -> BrowserSession:
        pass
        
    @abstractmethod
    def close(self, session_id: str) -> None:
        pass
        
    @abstractmethod
    def new_tab(self, session_id: str) -> BrowserTab:
        pass
        
    @abstractmethod
    def close_tab(self, tab_id: str) -> None:
        pass
        
    @abstractmethod
    def navigate(self, tab_id: str, url: str) -> BrowserTab:
        """Navigates to a URL. MUST increment page_generation."""
        pass
        
    @abstractmethod
    def get_session(self, session_id: str) -> BrowserSession:
        pass
        
    @abstractmethod
    def get_tab(self, tab_id: str) -> BrowserTab:
        pass
        
    @abstractmethod
    def get_frame(self, frame_id: str) -> BrowserFrame:
        pass

class BrowserDomProvider(ABC):
    """Identifies and resolves elements within the DOM."""
    
    @abstractmethod
    def identify(self, frame_id: str, strategy: str, selector: str) -> DomElement:
        """
        Locates an element and maps it to a DomElement instance.
        Must embed the current frame_generation and page_generation.
        """
        pass

class BrowserWaitProvider(ABC):
    """Provides DOM-aware wait conditions."""
    
    @abstractmethod
    def wait_for_condition(self, frame_id: str, condition: str, selector: Optional[str] = None, timeout_ms: int = 30000) -> None:
        """
        Waits for a specific condition (e.g., 'network_idle', 'element_visible').
        MUST raise WaitTimeoutError if the timeout is exceeded.
        """
        pass

class BrowserInputProvider(ABC):
    """Executes physical browser interactions."""
    
    @abstractmethod
    def click(self, element: DomElement) -> None:
        """Clicks an element. MUST validate element generations before acting."""
        pass
        
    @abstractmethod
    def type_text(self, element: DomElement, text: str) -> None:
        """Types text into an element. MUST validate element generations."""
        pass
        
    @abstractmethod
    def check(self, element: DomElement) -> None:
        pass
        
    @abstractmethod
    def uncheck(self, element: DomElement) -> None:
        pass
        
    @abstractmethod
    def select_option(self, element: DomElement, value: str) -> None:
        pass

class BrowserCaptureProvider(ABC):
    """Captures browser visual and structural state."""
    
    @abstractmethod
    def capture(self, tab_id: str, include_screenshot: bool = True, include_dom: bool = False) -> BrowserCaptureFrame:
        """Takes a physical capture of the current tab state."""
        pass

class BrowserVerificationProvider(ABC):
    """Provides deterministic verification of DOM state."""
    
    @abstractmethod
    def verify_state(self, element: DomElement, condition: str, expected_value: Optional[Any] = None) -> bool:
        """
        Verifies a given state against the element. Returns True if condition is met, False otherwise.
        Must raise StaleDomElementError if the element is stale.
        """
        pass
