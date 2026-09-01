"""
Conditions for Workflow definitions.
"""
from typing import Dict, Any, List, Optional, Union
from pydantic import BaseModel, Field

class Condition(BaseModel):
    """Base logic condition."""
    type: str

class IfCondition(Condition):
    type: str = "if"
    expression: str
    then_branch: Any # ExecutionPlan node
    else_branch: Optional[Any] = None

class ForEachCondition(Condition):
    type: str = "foreach"
    collection_expression: str
    item_variable: str
    body: Any

class WaitUntilCondition(Condition):
    type: str = "wait_until"
    expression: str
    timeout_ms: int = 30000

class WaitWhileCondition(Condition):
    type: str = "wait_while"
    expression: str
    timeout_ms: int = 30000

class TryCatchCondition(Condition):
    type: str = "try_catch"
    try_body: Any
    catch_body: Any
    finally_body: Optional[Any] = None
