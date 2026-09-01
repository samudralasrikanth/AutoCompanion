"""
Browser Automation Adapter.
"""
from typing import Dict, Any, Optional
from ..contracts.interfaces import IAutomationAdapter
from ..models.command import (
    Command,
    NavigationCommand,
    KeyboardCommand,
    MouseCommand,
    VerificationCommand
)
from ..models.browser import DomElement, BrowserCaptureFrame
from .browser_providers import (
    BrowserSessionProvider,
    BrowserCaptureProvider,
    BrowserInputProvider,
    BrowserDomProvider,
    BrowserWaitProvider,
    BrowserVerificationProvider
)

class BrowserAdapter(IAutomationAdapter):
    """Adapter for structured web automation (e.g., Playwright)."""
    
    def __init__(
        self,
        session_provider: BrowserSessionProvider,
        capture_provider: BrowserCaptureProvider,
        input_provider: BrowserInputProvider,
        dom_provider: BrowserDomProvider,
        wait_provider: BrowserWaitProvider,
        verification_provider: BrowserVerificationProvider,
        default_session_id: Optional[str] = None,
        default_tab_id: Optional[str] = None
    ):
        self.session_provider = session_provider
        self.capture_provider = capture_provider
        self.input_provider = input_provider
        self.dom_provider = dom_provider
        self.wait_provider = wait_provider
        self.verification_provider = verification_provider
        
        self.active_session_id = default_session_id
        self.active_tab_id = default_tab_id
        self.active_frame_id = default_tab_id  # Initially, the tab is the top-level frame

    @property
    def name(self) -> str:
        return "BrowserAdapter"

    def execute(self, command: Command) -> Dict[str, Any]:
        """
        Routes generic Command objects to strict provider methods.
        If a command is not supported, raises NotImplementedError.
        """
        if isinstance(command, NavigationCommand):
            return self._handle_navigation(command)
            
        elif isinstance(command, KeyboardCommand):
            return self._handle_keyboard(command)
            
        elif isinstance(command, MouseCommand):
            return self._handle_mouse(command)
            
        elif isinstance(command, VerificationCommand):
            return self._handle_verification(command)
            
        else:
            raise NotImplementedError(f"Command type {type(command).__name__} is not supported by BrowserAdapter.")

    def _handle_navigation(self, command: NavigationCommand) -> Dict[str, Any]:
        if command.action == "navigate_url":
            if not self.active_tab_id:
                raise RuntimeError("No active tab to navigate.")
            if not command.uri:
                raise ValueError("Navigation requires a URI.")
            
            tab = self.session_provider.navigate(self.active_tab_id, command.uri)
            # Update frame id to the new tab's root frame if it changed
            self.active_frame_id = tab.tab_id
            
            return {"status": "SUCCESS", "action": command.action, "url": tab.url}
            
        elif command.action == "launch_app":
            # Launch a new session/tab
            browser_type = command.arguments or "chromium"
            session = self.session_provider.launch(browser_type, headless=False)
            tab = self.session_provider.new_tab(session.session_id)
            if command.uri:
                tab = self.session_provider.navigate(tab.tab_id, command.uri)
                
            self.active_session_id = session.session_id
            self.active_tab_id = tab.tab_id
            self.active_frame_id = tab.tab_id
            return {"status": "SUCCESS", "action": command.action, "session_id": session.session_id}
            
        raise NotImplementedError(f"Navigation action '{command.action}' not supported.")

    def _handle_keyboard(self, command: KeyboardCommand) -> Dict[str, Any]:
        # Needs target element
        if not command.target_identifier:
            raise ValueError("KeyboardCommand requires a target element.")
            
        element = self._resolve_element(command.target_identifier)
        
        if command.action == "type":
            self.input_provider.type_text(element, command.text or "")
            return {"status": "SUCCESS", "action": command.action}
            
        raise NotImplementedError(f"Keyboard action '{command.action}' not supported.")

    def _handle_mouse(self, command: MouseCommand) -> Dict[str, Any]:
        if not command.target_identifier:
            raise ValueError("MouseCommand requires a target element.")
            
        element = self._resolve_element(command.target_identifier)
        
        if command.action == "click":
            self.input_provider.click(element)
            return {"status": "SUCCESS", "action": command.action}
            
        raise NotImplementedError(f"Mouse action '{command.action}' not supported.")
        
    def _handle_verification(self, command: VerificationCommand) -> Dict[str, Any]:
        if not command.target_identifier:
            raise ValueError("VerificationCommand requires a target element.")
            
        element = self._resolve_element(command.target_identifier)
        
        try:
            result = self.verification_provider.verify_state(element, command.verification_type, command.expected_value)
            if result:
                return {"status": "PASS", "reason": f"Element is {command.verification_type}"}
            else:
                return {"status": "FAIL", "reason": f"Element is not {command.verification_type}"}
        except ValueError as e:
            raise NotImplementedError(f"Verification type '{command.verification_type}' not supported.") from e

    def _resolve_element(self, identifier: Any) -> DomElement:
        """
        Helper to map a target identifier (e.g. dict selector) to a DomElement.
        """
        if isinstance(identifier, DomElement):
            return identifier
            
        if not self.active_frame_id:
            raise RuntimeError("No active frame to resolve element.")
            
        if isinstance(identifier, dict):
            strategy = str(identifier.get("type") or "css")
            if strategy == "css":
                selector = str(identifier.get("selector") or "")
            else:
                selector = str(identifier.get(strategy) or identifier.get("name") or "")
            return self.dom_provider.identify(self.active_frame_id, strategy, selector)
            
        # Default fallback string as CSS
        return self.dom_provider.identify(self.active_frame_id, "css", str(identifier))
