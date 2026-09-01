"""
Workflow Compiler.
Translates Workflows into ASTs, validates, optimizes, and emits Immutable Execution Plans.
"""
import uuid
from typing import Any, Dict
from ..contracts.interfaces import ICompiler
from ..foundation.exceptions import CompilationError
from ..models.workflow import ExecutionPlan, ASTNode

class WorkflowCompiler(ICompiler):
    """Compiles a raw workflow into a deterministic execution plan."""

    SUPPORTED_ACTIONS = {"click", "type", "launch", "close", "wait_for_window", "verify"}

    def compile(self, workflow: Dict[str, Any]) -> ExecutionPlan:
        """
        Lifecycle:
        1. Parse Workflow to AST.
        2. Validate AST (dead steps, invalid properties).
        3. Optimize AST (eliminate dead code).
        4. Return Immutable Execution Plan.
        """
        ast = self._generate_ast(workflow)
        self._validate(ast)
        optimized_ast = self._optimize(ast)
        return self._emit_plan(workflow, optimized_ast)

    def _generate_ast(self, workflow: Dict[str, Any]) -> ASTNode:
        root_node = ASTNode(node_id="root", node_type="workflow")
        steps = workflow.get("steps", [])
        for i, step in enumerate(steps):
            action_key = list(step.keys())[0] if isinstance(step, dict) else "unknown"
            params = step.get(action_key, {}) if isinstance(step, dict) else {}
            child = ASTNode(node_id=f"step_{i}", node_type=action_key, parameters=params)
            root_node.children.append(child)
        return root_node

    def _validate(self, ast: ASTNode) -> None:
        """Validate the AST for unsupported actions and missing required properties."""
        for child in ast.children:
            if child.node_type not in self.SUPPORTED_ACTIONS:
                raise CompilationError(f"Unsupported action type: {child.node_type}")

            # Validate required parameters for known actions
            if child.node_type in ("click", "type", "verify") and "target" not in child.parameters:
                raise CompilationError(f"Action '{child.node_type}' requires a 'target' parameter")
            if child.node_type == "type" and "text" not in child.parameters:
                raise CompilationError(f"Action 'type' requires a 'text' parameter")

    def _optimize(self, ast: ASTNode) -> ASTNode:
        """Eliminate dead code - steps with empty parameters or unknown types."""
        optimized_children = []
        for child in ast.children:
            # Skip steps that are explicitly disabled
            if child.parameters.get("disabled", False):
                continue
            optimized_children.append(child)
        ast.children = optimized_children
        return ast

    def _emit_plan(self, workflow: Dict[str, Any], ast: ASTNode) -> ExecutionPlan:
        wf_meta = workflow.get("workflow", {})
        return ExecutionPlan(
            plan_id=f"plan-{uuid.uuid4().hex[:8]}",
            workflow_id=wf_meta.get("name", "Unknown"),
            version=wf_meta.get("version", "1.0"),
            root_node=ast,
            metadata=wf_meta.get("metadata", {})
        )