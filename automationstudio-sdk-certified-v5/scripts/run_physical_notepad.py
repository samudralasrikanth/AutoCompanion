"""
Sample script to execute automation against a physical local application (Notepad).
This is meant to be run directly on a Windows host.
"""
import sys
import time

def main():
    print("Initializing Physical Desktop Automation Adapter...")
    try:
        from automationstudio.sdk.adapters.desktop import DesktopAdapter
        from automationstudio.sdk.adapters.windows_providers import WindowsCitrixCaptureProvider, WindowsCitrixInputProvider, WindowsCitrixSessionProvider
        
        from automationstudio.sdk.execution.pipeline import ExecutionPipeline
        from automationstudio.sdk.execution.stages import (
            StateValidationStage, CommandTranslationStage, IdentificationStage, AdapterStage,
            VerificationStage, RecoveryStage, AuditStage
        )
        from automationstudio.sdk.models.workflow import ExecutionPlan, ASTNode
        from automationstudio.sdk.runtime.context import (
            AutomationContext, ExecutionContext, WorkflowContext,
            SecurityContext, VariableContext, AuditContext, RuntimeContext, EnvironmentCapabilities
        )
    except ImportError:
        print("Please run this script from the SDK root with PYTHONPATH=src")
        sys.exit(1)
        
    print("Creating Pipeline with Windows Providers (mss + ctypes)...")
    
    # We reuse WindowsCitrixCaptureProvider and WindowsCitrixInputProvider 
    # since they implement real mss capture and ctypes SendInput.
    # We pass a dummy session provider to it because it needs one for bounds.
    session_prov = WindowsCitrixSessionProvider() 
    capture_prov = WindowsCitrixCaptureProvider(session_prov)
    input_prov = WindowsCitrixInputProvider()
    
    class DummyProvider:
        def __getattr__(self, name):
            def _dummy(*args, **kwargs):
                pass
            return _dummy
            
    adapter = DesktopAdapter(
        input_provider=input_prov,
        window_provider=DummyProvider(),
        process_provider=DummyProvider(),
        accessibility_provider=DummyProvider(),
        capture_provider=capture_prov
    )
    
    pipeline = ExecutionPipeline()
    pipeline.add_stage(StateValidationStage())
    pipeline.add_stage(CommandTranslationStage())
    pipeline.add_stage(IdentificationStage(adapter))
    pipeline.add_stage(AdapterStage(adapter))
    pipeline.add_stage(VerificationStage(adapter))
    pipeline.add_stage(RecoveryStage())
    pipeline.add_stage(AuditStage())
    
    capabilities = EnvironmentCapabilities(
        accessibility=False,
        native_controls=False,
        visual=True,
        ocr=True,
        remote_interaction=False
    )
    
    context = AutomationContext(
        execution=ExecutionContext(execution_id="real-notepad-003"),
        workflow=WorkflowContext(workflow_id="n-003", workflow_name="notepad_test_real", version="1.0"),
        security=SecurityContext(run_as_user="bot", domain="local"),
        variables=VariableContext(),
        audit=AuditContext(trace_id="tr-3", correlation_id="cor-3"),
        runtime=RuntimeContext(platform="Windows", os_version="10", resolution="1920x1080", timezone="UTC", locale="en-US", capabilities=capabilities)
    )
    
    print("Constructing deterministic workflow for Notepad...")
    
    # Launch Notepad (dummy action, process provider is mocked)
    step1 = ASTNode(node_id="launch_notepad", node_type="launch", parameters={"target": "notepad.exe"})
    # Click somewhere in Notepad (requires visual template matching)
    step2 = ASTNode(node_id="click_editor", node_type="click", parameters={"target": {"type": "image", "template": "notepad_editor.png"}})
    # Type something
    step3 = ASTNode(node_id="type_text", node_type="type", parameters={"text": "Hello AutoCon!"})
    
    root = ASTNode(node_id="root", node_type="workflow")
    root.children.extend([step1, step2, step3])
    plan = ExecutionPlan(plan_id="p-3", workflow_id="n-003", version="1.0", root_node=root, metadata={})
    
    print("\n--- EXECUTING PHYSICAL NOTEPAD TRACE ---")
    start_time = time.time()
    result = pipeline.execute_plan(plan, context)
    end_time = time.time()
    
    print(f"\nExecution Complete: {result.status.name} (Duration: {end_time - start_time:.2f}s)")
    for step in result.steps:
        print(f"Step {step.action_id} - {step.status.name}")
        for log in step.logs:
            print(f"  > {log}")

if __name__ == "__main__":
    main()
