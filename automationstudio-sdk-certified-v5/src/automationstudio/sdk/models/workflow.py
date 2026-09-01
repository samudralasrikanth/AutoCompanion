"""
Workflow AST and Execution Plan models.
"""
from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field

class ASTNode(BaseModel):
    """Abstract Syntax Tree node for a workflow action."""
    node_id: str
    node_type: str
    parameters: Dict[str, Any] = Field(default_factory=dict)
    children: List['ASTNode'] = Field(default_factory=list)

class ExecutionPlan(BaseModel):
    """Immutable compiled execution plan."""
    plan_id: str
    workflow_id: str
    version: str
    root_node: ASTNode
    metadata: Dict[str, Any] = Field(default_factory=dict)
    
    model_config = {"frozen": True} # Enforce immutability
