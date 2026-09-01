import platform
from typing import Any
from ..contracts.interfaces import IAutomationAdapter, AdapterCapabilities
from ..models.capture import CaptureFrame
from ..foundation.geometry import Rectangle, CoordinateTranslator

from abc import ABC, abstractmethod

class CitrixSessionProvider(ABC):
    @abstractmethod
    def attach(self, session_id: str) -> None:
        pass
        
    @abstractmethod
    def get_window_bounds(self) -> dict:
        pass

class CitrixCaptureProvider(ABC):
    @abstractmethod
    def capture(self, context: Any) -> CaptureFrame:
        pass

class CitrixInputProvider(ABC):
    @abstractmethod
    def click(self, x: int, y: int) -> None:
        pass
            
    @abstractmethod
    def type_text(self, text: str) -> None:
        pass

class CitrixAdapter(IAutomationAdapter):
    def __init__(self, 
                 session_provider: CitrixSessionProvider,
                 capture_provider: CitrixCaptureProvider,
                 input_provider: CitrixInputProvider):
        self.session_provider = session_provider
        self.capture_provider = capture_provider
        self.input_provider = input_provider
        
    @property
    def name(self) -> str:
        return "CitrixAdapter"

    @property
    def capabilities(self) -> AdapterCapabilities:
        return AdapterCapabilities(
            supports_mouse=True,
            supports_keyboard=True,
            supports_accessibility=False,
            supports_dom=False,
            supports_visual=True
        )
        
    def execute_command(self, command: Any, context: Any) -> Any:
        from ..models.command import MouseCommand, KeyboardCommand, NavigationCommand, VerificationCommand
        from ..models.locator import LocatorResult
        
        provider_name = "UnknownProvider"
        
        if isinstance(command, MouseCommand) and command.action == 'click':
            # Extract locator result
            target = command.target_identifier
            if isinstance(target, LocatorResult) and target.rectangle:
                
                from ..foundation.exceptions import StaleLocatorError
                
                # Retrieve active capture from context
                active_capture = getattr(context.execution, "active_capture", None)
                if active_capture is None:
                    raise StaleLocatorError("No active capture available")
                    
                if target.capture_id != active_capture.capture_id:
                    raise StaleLocatorError(
                        f"Locator capture {target.capture_id} "
                        f"does not match active capture {active_capture.capture_id}"
                    )
                
                screen_rect = CoordinateTranslator.capture_to_screen(target.rectangle, active_capture)
                
                # Execute input
                self.input_provider.click(screen_rect.x, screen_rect.y)
                
                # Audit
                if hasattr(context, "execution"):
                    context.execution.state_snapshots["coordinate_transformation"] = {
                        "original": {"x": target.rectangle.x, "y": target.rectangle.y},
                        "source_space": target.coordinate_space.value,
                        "transformed": {"x": screen_rect.x, "y": screen_rect.y},
                        "destination_space": "SCREEN"
                    }
                return {"status": "SUCCESS", "provider": self.input_provider.__class__.__name__}
                
        elif isinstance(command, KeyboardCommand) and command.action == 'type':
            self.input_provider.type_text(command.text or "")
            return {"status": "SUCCESS", "provider": self.input_provider.__class__.__name__}
            
        elif isinstance(command, NavigationCommand):
            if command.action == 'launch':
                self.session_provider.attach(command.target_identifier or "")
                return {"status": "SUCCESS", "provider": self.session_provider.__class__.__name__}
                
        elif isinstance(command, VerificationCommand):
            return {"status": "NOT_APPLICABLE", "reason": "VerificationCommand is evaluated by VerificationStage", "provider": self.name}
            
        return {"status": "NOT_SUPPORTED", "provider": provider_name}
