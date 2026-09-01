"""
Automation Studio CLI.
Provides execution and diagnostics tooling.
"""
import argparse
import sys
import uuid
from pprint import pprint

from automationstudio.sdk.parser.workflow_parser import WorkflowParser
from automationstudio.sdk.execution.pipeline import ExecutionPipeline
from automationstudio.sdk.execution.stages import (
    StateValidationStage, CommandTranslationStage, IdentificationStage, AdapterStage,
    VerificationStage, RecoveryStage, AuditStage
)
from automationstudio.sdk.adapters.desktop import DesktopAdapter
from automationstudio.sdk.adapters.mocks import (
    MockInputProvider, MockWindowProvider, MockProcessProvider, MockAccessibilityProvider
)
from automationstudio.sdk.runtime.context import AutomationContext
from automationstudio.sdk.runtime.services.capture_service import MockCaptureProvider

from automationstudio.sdk.foundation.di import Container
from automationstudio.sdk.contracts.interfaces import IAutomationAdapter
from automationstudio.sdk.adapters.providers import (
    IInputProvider, IWindowProvider, IProcessProvider, IAccessibilityProvider
)

def build_di_container() -> Container:
    """Resolves providers based on OS via DI Container."""
    container = Container()

    if sys.platform == "win32":
        from automationstudio.sdk.adapters.desktop_providers import DesktopInputProvider, DesktopCaptureProvider
        container.register_instance(IInputProvider, DesktopInputProvider())
        container.register_instance(IWindowProvider, MockWindowProvider())
        container.register_instance(IProcessProvider, MockProcessProvider())
        container.register_instance(IAccessibilityProvider, MockAccessibilityProvider())
        
        def adapter_factory(c: Container) -> IAutomationAdapter:
            return DesktopAdapter(
                input_provider=c.resolve(IInputProvider),
                window_provider=c.resolve(IWindowProvider),
                process_provider=c.resolve(IProcessProvider),
                accessibility_provider=c.resolve(IAccessibilityProvider),
                capture_provider=DesktopCaptureProvider()
            )
        container.register_factory(IAutomationAdapter, adapter_factory)
    else:
        # Register mock providers for macOS/Linux execution
        container.register_instance(IInputProvider, MockInputProvider())
        container.register_instance(IWindowProvider, MockWindowProvider())
        container.register_instance(IProcessProvider, MockProcessProvider())
        container.register_instance(IAccessibilityProvider, MockAccessibilityProvider())
    
        # Register the Desktop Adapter using factory to inject dependencies
        def adapter_factory(c: Container) -> IAutomationAdapter:
            return DesktopAdapter(
                input_provider=c.resolve(IInputProvider),
                window_provider=c.resolve(IWindowProvider),
                process_provider=c.resolve(IProcessProvider),
                accessibility_provider=c.resolve(IAccessibilityProvider),
                capture_provider=MockCaptureProvider()
            )
        container.register_factory(IAutomationAdapter, adapter_factory)

    return container

def main():
    parser = argparse.ArgumentParser(description="Automation Studio CLI")
    subparsers = parser.add_subparsers(dest="command")

    run_parser = subparsers.add_parser("run", help="Run a workflow")
    run_parser.add_argument("path", help="Path to the workflow YAML/JSON")

    args = parser.parse_args()

    if args.command == "run":
        print(f"Loading Workflow: {args.path}")
        wp = WorkflowParser()
        raw_ast = wp.parse_file(args.path)
        print("-> Parse SUCCESS")

        from automationstudio.sdk.execution.compiler import WorkflowCompiler
        compiler = WorkflowCompiler()
        execution_plan = compiler.compile(raw_ast)
        print("-> Compile SUCCESS (ExecutionPlan Created)")

        container = build_di_container()
        adapter = container.resolve(IAutomationAdapter)

        pipeline = ExecutionPipeline()
        pipeline.add_stage(StateValidationStage())
        pipeline.add_stage(CommandTranslationStage())
        pipeline.add_stage(IdentificationStage(adapter))
        pipeline.add_stage(AdapterStage(adapter))
        pipeline.add_stage(VerificationStage(adapter))
        pipeline.add_stage(RecoveryStage())
        pipeline.add_stage(AuditStage())

        from automationstudio.sdk.runtime.context import (
            AutomationContext, ExecutionContext, WorkflowContext,
            SecurityContext, VariableContext, AuditContext, RuntimeContext
        )
        # Build Context with generated IDs and no hardcoded credentials
        execution_id = f"exec-{uuid.uuid4().hex[:8]}"
        context = AutomationContext(
            execution=ExecutionContext(execution_id=execution_id),
            workflow=WorkflowContext(workflow_id=f"wf-{uuid.uuid4().hex[:8]}", workflow_name="workflow", version="1.0"),
            security=SecurityContext(run_as_user="current_user", domain="local"),
            variables=VariableContext(),
            audit=AuditContext(trace_id=f"tr-{uuid.uuid4().hex[:8]}", correlation_id=f"c-{uuid.uuid4().hex[:8]}"),
            runtime=RuntimeContext(platform="macOS", os_version="14.0", resolution="1920x1080", timezone="UTC", locale="en-US")
        )
        print("-> Session Created")

        result = pipeline.execute_plan(execution_plan, context)

        print("\n=== Execution Trace ===")
        for step in result.steps:
            print(f"Action: {step.action_id}")
            for log in step.logs:
                print(f"  {log}")
            print(f"  Overall Step Duration: {step.duration_ms:.2f}ms\n")

        print(f"Final Status: {result.status.name}")
        print(f"Artifacts: {result.artifacts}")
        print("=======================")

if __name__ == "__main__":
    main()