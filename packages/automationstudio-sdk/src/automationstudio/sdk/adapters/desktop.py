"""
Desktop Automation Adapters.
"""
from typing import Any, Optional, Tuple
from ..contracts.interfaces import IAutomationAdapter, AdapterCapabilities
from .providers import IInputProvider, IWindowProvider, IProcessProvider, IAccessibilityProvider
from ..models.locator import LocatorResult

class DesktopAdapter(IAutomationAdapter):
    """
    Orchestrator of physical execution for desktop platforms.
    """
    def __init__(self,
                 input_provider: IInputProvider,
                 window_provider: IWindowProvider,
                 process_provider: IProcessProvider,
                 accessibility_provider: IAccessibilityProvider,
                 visual_provider: Any = None,
                 ocr_provider: Any = None,
                 native_provider: Any = None,
                 capture_provider: Any = None):
        self.input_provider = input_provider
        self.window_provider = window_provider
        self.process_provider = process_provider
        self.accessibility_provider = accessibility_provider
        self.visual_provider = visual_provider
        self.ocr_provider = ocr_provider
        self.native_provider = native_provider
        self.capture_provider = capture_provider

    @property
    def name(self) -> str:
        return "DesktopAdapter"

    @property
    def capabilities(self) -> AdapterCapabilities:
        return AdapterCapabilities(
            supports_mouse=True,
            supports_keyboard=True,
            supports_accessibility=True,
            supports_dom=False,
            supports_visual=True
        )

    def _extract_coordinates(self, target: Any) -> Optional[Tuple[int, int]]:
        """Extract click coordinates from a resolved LocatorResult."""
        if isinstance(target, LocatorResult) and target.rectangle:
            return (target.rectangle.x, target.rectangle.y)
        return None

    def execute_command(self, command: Any, context: Any) -> Any:
        from ..models.command import MouseCommand, KeyboardCommand, NavigationCommand, VerificationCommand

        if isinstance(command, NavigationCommand):
            if command.action == 'launch' and command.target_identifier is not None:
                self.process_provider.launch(command.target_identifier)
                return {"status": "SUCCESS", "provider": self.process_provider.__class__.__name__}
            elif command.action == 'wait_for_window' and command.target_identifier is not None:
                self.window_provider.wait(command.target_identifier)
                return {"status": "SUCCESS", "provider": self.window_provider.__class__.__name__}
            elif command.action == 'close' and command.target_identifier is not None:
                self.window_provider.close(command.target_identifier)
                return {"status": "SUCCESS", "provider": self.window_provider.__class__.__name__}
            return {"status": "NOT_SUPPORTED", "provider": self.__class__.__name__}

        elif isinstance(command, KeyboardCommand):
            if command.action == 'type' and command.text is not None:
                self.input_provider.type_text(command.text)
                return {"status": "SUCCESS", "provider": self.input_provider.__class__.__name__}
            return {"status": "NOT_SUPPORTED", "provider": self.__class__.__name__}

        elif isinstance(command, MouseCommand):
            if command.action == 'click':
                coords = self._extract_coordinates(command.target_identifier)
                if coords is None:
                    return {"status": "NOT_SUPPORTED", "provider": self.__class__.__name__,
                            "error": "No resolved locator coordinates available for click"}
                self.input_provider.click(coords[0], coords[1])
                return {"status": "SUCCESS", "provider": self.input_provider.__class__.__name__}
            return {"status": "NOT_SUPPORTED", "provider": self.__class__.__name__}

        elif isinstance(command, VerificationCommand):
            return {"status": "NOT_APPLICABLE", "reason": "VerificationCommand is evaluated by VerificationStage", "provider": self.__class__.__name__}

        return {"status": "NOT_SUPPORTED", "provider": self.__class__.__name__}