"""
Variable stores and references.
"""
from typing import Dict, Any
from pydantic import BaseModel, Field

class VariableStore(BaseModel):
    """Manages strictly typed variables across execution scopes."""
    global_vars: Dict[str, Any] = Field(default_factory=dict)
    workflow_vars: Dict[str, Any] = Field(default_factory=dict)
    local_vars: Dict[str, Any] = Field(default_factory=dict)
    
    def get(self, name: str) -> Any:
        if name in self.local_vars:
            return self.local_vars[name]
        if name in self.workflow_vars:
            return self.workflow_vars[name]
        if name in self.global_vars:
            return self.global_vars[name]
        raise KeyError(f"Variable {name} not found in store.")
        
    def set_local(self, name: str, value: Any) -> None:
        self.local_vars[name] = value
