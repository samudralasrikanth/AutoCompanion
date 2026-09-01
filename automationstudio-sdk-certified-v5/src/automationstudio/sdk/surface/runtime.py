"""Small Surface runtime facade over the existing execution stages."""
from typing import Any, Optional
import sys
import uuid

from ..execution.compiler import WorkflowCompiler
from ..execution.pipeline import ExecutionPipeline
from ..execution.stages import (
    AdapterStage,
    AuditStage,
    CommandTranslationStage,
    IdentificationStage,
    RecoveryStage,
    StateValidationStage,
    SurfaceWaitStage,
    VerificationStage,
)
from ..runtime.context import (
    AuditContext,
    AutomationContext,
    EnvironmentCapabilities,
    ExecutionContext,
    RuntimeContext,
    SecurityContext,
    VariableContext,
    WorkflowContext,
)


class SurfaceWindowContext:
    """Single owner for the attached Surface window and its capture provider."""
    def __init__(self, session_provider: Any, capture_provider: Any):
        self.session_provider = session_provider
        self.capture_provider = capture_provider
        self.attached_title: Optional[str] = None

    def attach(self, title: str) -> None:
        if not title or title == self.attached_title:
            return
        self.session_provider.attach(title)
        self.attached_title = title

    def capture(self, context: Any) -> Any:
        return self.capture_provider.capture(context)


class SurfaceRuntime:
    def __init__(self, adapter: Any = None, artifact_dir: str = ".artifacts", max_retries: int = 2):
        self.adapter = adapter
        self.artifact_dir = artifact_dir
        self.max_retries = max(0, int(max_retries))
        self.window_context: Optional[SurfaceWindowContext] = None

    @classmethod
    def from_workflow(cls, workflow: dict[str, Any], artifact_dir: str = ".artifacts", max_retries: int = 2) -> "SurfaceRuntime":
        runtime = workflow.get("runtime", {}) if isinstance(workflow, dict) else {}
        title = runtime.get("window_title")
        if sys.platform != "win32" or not title:
            return cls(artifact_dir=artifact_dir, max_retries=max_retries)

        from ..adapters.citrix import CitrixAdapter
        from ..adapters.windows_providers import WindowsCitrixCaptureProvider, WindowsCitrixInputProvider, WindowsCitrixSessionProvider
        session = WindowsCitrixSessionProvider()
        window_context = SurfaceWindowContext(session, WindowsCitrixCaptureProvider(session))
        window_context.attach(title)
        instance = cls(CitrixAdapter(session, window_context.capture_provider, WindowsCitrixInputProvider()), artifact_dir, max_retries)
        instance.window_context = window_context
        return instance

    def _context(self, workflow: dict[str, Any]) -> AutomationContext:
        name = workflow.get("workflow", {}).get("name", "Surface Workflow")
        execution_id = f"surface-{uuid.uuid4().hex[:12]}"
        return AutomationContext(
            execution=ExecutionContext(execution_id=execution_id),
            workflow=WorkflowContext(workflow_id=name, workflow_name=name, version=workflow.get("workflow", {}).get("version", "1.0")),
            security=SecurityContext(run_as_user="bot", domain="local"),
            variables=VariableContext(),
            audit=AuditContext(trace_id=execution_id, correlation_id=execution_id),
            runtime=RuntimeContext(
                platform="Surface",
                os_version=sys.platform,
                resolution="managed",
                timezone="UTC",
                locale="en-US",
                capabilities=EnvironmentCapabilities(
                    accessibility=bool(getattr(self.adapter, "accessibility_provider", None)),
                    native_controls=bool(getattr(self.adapter, "native_provider", None)),
                    visual=bool(getattr(self.adapter, "visual_provider", None)) or self.adapter is not None,
                    ocr=bool(getattr(self.adapter, "ocr_provider", None)) or self.adapter is not None,
                    remote_interaction=self.adapter is not None,
                ),
            ),
        )

    def run(self, workflow: dict[str, Any]):
        plan = WorkflowCompiler().compile(workflow)
        context = self._context(workflow)
        pipeline = ExecutionPipeline()
        pipeline.add_stage(StateValidationStage())
        pipeline.add_stage(CommandTranslationStage())
        pipeline.add_stage(SurfaceWaitStage(self.adapter, phase="before"))
        pipeline.add_stage(IdentificationStage(self.adapter))
        pipeline.add_stage(AdapterStage(self.adapter))
        pipeline.add_stage(SurfaceWaitStage(self.adapter, phase="after"))
        pipeline.add_stage(VerificationStage(self.adapter))
        pipeline.add_stage(RecoveryStage(adapter=self.adapter, max_retries=self.max_retries))
        pipeline.add_stage(AuditStage(self.artifact_dir))
        return pipeline.execute_plan(plan, context)


def run_surface_workflow(
    workflow: dict[str, Any],
    adapter: Any = None,
    max_retries: int = 2,
    artifact_dir: str = ".artifacts",
):
    runtime = SurfaceRuntime(adapter=adapter, artifact_dir=artifact_dir, max_retries=max_retries)
    if adapter is None:
        runtime = SurfaceRuntime.from_workflow(workflow, artifact_dir=artifact_dir, max_retries=max_retries)
    return runtime.run(workflow)
