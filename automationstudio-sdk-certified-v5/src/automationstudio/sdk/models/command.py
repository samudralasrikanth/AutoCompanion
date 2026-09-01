"""
Command abstraction for decoupling workflow logic from physical platform execution.
"""
from typing import Dict, Any, Optional
from pydantic import BaseModel, Field

class Command(BaseModel):
    """Base instruction executed by an adapter."""
    command_id: str
    target_identifier: Optional[Any] = None
    provider: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)

class InteractionCommand(Command):
    """Commands that physically interact with an element."""
    pass

class MouseCommand(InteractionCommand):
    """Mouse interaction commands."""
    action: str  # "click", "double_click", "hover", "drag"
    button: str = "left"
    modifiers: list[str] = Field(default_factory=list)
    x_offset: int = 0
    y_offset: int = 0

class KeyboardCommand(InteractionCommand):
    """Keyboard interaction commands."""
    action: str  # "type", "press_key", "shortcut"
    text: Optional[str] = None
    keys: list[str] = Field(default_factory=list)
    secure: bool = False

class NavigationCommand(Command):
    """High-level navigation instructions."""
    action: str  # "navigate_url", "launch_app", "close_window"
    uri: Optional[str] = None
    arguments: Optional[str] = None

class VerificationCommand(Command):
    """Command strictly asserting a state condition."""
    verification_type: str  # "exists", "visible", "text_equals", etc.
    expected_value: Optional[Any] = None
