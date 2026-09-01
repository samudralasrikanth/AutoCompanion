"""
Domain models for browser automation.
"""
from typing import Optional, Any
from pydantic import BaseModel, Field
from datetime import datetime, timezone

def _utcnow():
    return datetime.now(timezone.utc)

class BrowserSession(BaseModel):
    """Represents an active browser instance."""
    session_id: str
    browser_type: str  # e.g., 'chromium', 'firefox', 'webkit'
    process_id: Optional[int] = None
    created_at: datetime = Field(default_factory=_utcnow)

class BrowserTab(BaseModel):
    """Represents a tab/page within a browser session."""
    tab_id: str
    session_id: str
    url: str
    title: str
    page_generation: int = 1

class BrowserFrame(BaseModel):
    """Represents a frame or iframe within a tab."""
    frame_id: str
    tab_id: str
    parent_frame_id: Optional[str] = None
    url: str
    frame_generation: int = 1

class DomElement(BaseModel):
    """Represents an identified element in the DOM."""
    element_id: str
    session_id: str
    tab_id: str
    frame_id: str
    selector: str
    strategy: str  # 'css', 'xpath', 'role', 'text', etc.
    created_at: datetime = Field(default_factory=_utcnow)
    page_generation: int
    frame_generation: int

class BrowserCaptureFrame(BaseModel):
    """Represents a physical screen/DOM capture at a point in time."""
    capture_id: str
    session_id: str
    tab_id: str
    frame_id: str
    url: str
    page_generation: int
    timestamp: datetime = Field(default_factory=_utcnow)
    screenshot: Optional[bytes] = None  # PNG binary
    dom_snapshot: Optional[str] = None  # Serialized HTML or DOM tree

# Browser-Specific Exceptions

class BrowserError(Exception):
    """Base class for browser automation errors."""
    pass

class StaleDomElementError(BrowserError):
    """Raised when attempting to interact with a DomElement whose page or frame generation has advanced."""
    pass

class InvalidBrowserSessionError(BrowserError):
    """Raised when the specified browser session is closed, missing, or invalid."""
    pass

class InvalidBrowserFrameError(BrowserError):
    """Raised when a specified frame or tab is missing or has been destroyed."""
    pass

class WaitTimeoutError(BrowserError):
    """Raised when a synchronization/wait condition times out."""
    pass
