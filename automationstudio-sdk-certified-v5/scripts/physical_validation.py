import sys
import json
import logging
from automationstudio.sdk.adapters.windows_providers import (
    WindowsCitrixCaptureProvider,
    WindowsCitrixInputProvider,
    WindowsCitrixSessionProvider
)
from automationstudio.sdk.adapters.citrix import CitrixAdapter
from automationstudio.sdk.execution.pipeline import ExecutionPipeline
from automationstudio.sdk.execution.stages import (
    StateValidationStage, CommandTranslationStage, IdentificationStage,
    AdapterStage, VerificationStage, RecoveryStage, AuditStage
)
from automationstudio.sdk.models.workflow import ExecutionPlan, ASTNode
from automationstudio.sdk.runtime.context import (
    AutomationContext, ExecutionContext, WorkflowContext,
    SecurityContext, VariableContext, AuditContext, RuntimeContext
)

logging.basicConfig(level=logging.INFO)

def setup_pipeline():
    session_provider = WindowsCitrixSessionProvider()
    capture_provider = WindowsCitrixCaptureProvider(session_provider)
    input_provider = WindowsCitrixInputProvider()
    
    adapter = CitrixAdapter(
        session_provider=session_provider,
        capture_provider=capture_provider,
        input_provider=input_provider
    )
    
    pipeline = ExecutionPipeline()
    pipeline.add_stage(StateValidationStage())
    pipeline.add_stage(CommandTranslationStage())
    pipeline.add_stage(IdentificationStage(adapter))
    pipeline.add_stage(AdapterStage(adapter))
    pipeline.add_stage(VerificationStage(adapter))
    pipeline.add_stage(RecoveryStage(adapter=adapter))
    pipeline.add_stage(AuditStage())
    
    return pipeline, session_provider

def run_physical_notepad_validation():
    print("=== Running Physical Notepad Validation ===")
    
    pipeline, session_provider = setup_pipeline()
    
    # 1. Attach to Notepad
    try:
        session_provider.attach("Notepad")
        bounds = session_provider.get_window_bounds()
        print(f"Attached to Notepad successfully. Client Bounds: {bounds}")
    except Exception as e:
        print(f"Failed to attach to Notepad: {e}")
        print("Please open Notepad before running this script.")
        return

    # 2. Setup Context
    context = AutomationContext(
        execution=ExecutionContext(execution_id="notepad-test-1"),
        workflow=WorkflowContext(workflow_id="wf-1", workflow_name="notepad-test", version="1.0"),
        security=SecurityContext(run_as_user="test_user", domain="local"),
        variables=VariableContext(),
        audit=AuditContext(trace_id="tr-1", correlation_id="c-1"),
        runtime=RuntimeContext(
            platform=sys.platform,
            os_version="10",
            resolution="unknown",
            timezone="UTC",
            locale="en-US"
        )
    )

    # 3. Create Execution Plan
    click_file_node = ASTNode(
        node_id="click_file_menu",
        node_type="click",
        parameters={"target": {"text": "File"}}
    )
    
    type_node = ASTNode(
        node_id="type_text",
        node_type="type",
        parameters={"target": {"text": "Edit"}, "text": "Hello World"}
    )
    
    root = ASTNode(node_id="root", node_type="workflow")
    root.children.extend([click_file_node, type_node])
    plan = ExecutionPlan(plan_id="p-notepad", workflow_id="wf-1", version="1.0", root_node=root, metadata={})

    # 4. Execute Pipeline
    result = pipeline.execute_plan(plan, context)
    
    print(f"\\nPipeline Status: {result.status.name}")
    audit_path = context.execution.state_snapshots.get("audit_path")
    if audit_path:
        print(f"Audit log written to: {audit_path}")
        with open(audit_path, "r") as f:
            print(json.dumps(json.load(f), indent=2))
            
    if result.status.name != "COMPLETED":
        print("Validation FAILED.")
        sys.exit(1)
    else:
        print("Validation PASSED.")

if __name__ == "__main__":
    if sys.platform != "win32":
        print(f"Warning: Physical tests are intended to run on win32, current platform is {sys.platform}.")
    run_physical_notepad_validation()
