"""
Object Repository Models.
Defines the strict hierarchy of the Application -> Window -> Screen -> Component -> Container -> Control.
"""
from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field

class RepositoryMetadata(BaseModel):
    """Strictly versioned metadata for all repository objects."""
    revision: int = 1
    created_at: float
    updated_at: float
    checksum: str
    owner: str = "system"
    source: str = "studio"

class RepositoryObject(BaseModel):
    """Base class for all elements stored in the Object Repository."""
    id: str
    name: str
    description: str = ""
    metadata: RepositoryMetadata

class Locator(BaseModel):
    """Definition of how to find an object."""
    strategies: List[Dict[str, Any]] = Field(default_factory=list)
    confidence_required: float = 0.85

class Control(RepositoryObject):
    """A primitive interactive element (Button, TextField)."""
    type: str
    locator: Locator

class Container(RepositoryObject):
    """A logical grouping of controls (Panel, Frame)."""
    controls: List[Control] = Field(default_factory=list)

class Component(RepositoryObject):
    """A high-level, reusable composite UI element (Toolbar, Ribbon, Grid, Table, Menu)."""
    type: str # e.g. "Ribbon", "Grid"
    containers: List[Container] = Field(default_factory=list)
    controls: List[Control] = Field(default_factory=list)

class Screen(RepositoryObject):
    """A specific visual state within a window."""
    components: List[Component] = Field(default_factory=list)
    containers: List[Container] = Field(default_factory=list)
    controls: List[Control] = Field(default_factory=list)

class Window(RepositoryObject):
    """An OS-level window containing screens."""
    title_pattern: str
    process_name: Optional[str] = None
    screens: List[Screen] = Field(default_factory=list)

class Application(RepositoryObject):
    """The root of a target application's object repository."""
    app_id: str
    version_pattern: str
    windows: List[Window] = Field(default_factory=list)
