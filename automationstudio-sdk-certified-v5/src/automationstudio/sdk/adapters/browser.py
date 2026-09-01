"""
Browser Automation Adapters.
"""
from ..contracts.interfaces import IAutomationAdapter
from ..models.command import Command

class BrowserAdapter(IAutomationAdapter):
    """Adapter for web automation (Playwright/Selenium CDP)."""
    @property
    def name(self) -> str:
        return "BrowserAdapter"
        
    def click(self, x: int, y: int) -> None:
        pass
        
    def type_text(self, text: str) -> None:
        pass
