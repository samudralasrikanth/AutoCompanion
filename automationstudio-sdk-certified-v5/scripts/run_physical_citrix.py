"""
Sample script to execute automation against a physical Citrix session.
This is meant to be run directly on a Windows host with an active Citrix session.
"""
import sys
import time

def main():
    print("Initializing Real Citrix Automation Adapter...")
    try:
        from automationstudio.sdk.adapters.citrix import CitrixAdapter
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
        
    print("Creating Pipeline with Windows Citrix Adapters (mss + ctypes)...")
    
    session_prov = WindowsCitrixSessionProvider()
    capture_prov = WindowsCitrixCaptureProvider(session_prov)
    input_prov = WindowsCitrixInputProvider()
    
    adapter = CitrixAdapter(
        session_provider=session_prov,
        capture_provider=capture_prov,
        input_provider=input_prov
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
        remote_interaction=True
    )
    
    context = AutomationContext(
        execution=ExecutionContext(execution_id="real-citrix-002"),
        workflow=WorkflowContext(workflow_id="c-002", workflow_name="citrix_test_real", version="1.0"),
        security=SecurityContext(run_as_user="bot", domain="local"),
        variables=VariableContext(),
        audit=AuditContext(trace_id="tr-2", correlation_id="cor-2"),
        runtime=RuntimeContext(platform="Citrix", os_version="Windows", resolution="1920x1080", timezone="UTC", locale="en-US", capabilities=capabilities)
    )
    
    print("Constructing deterministic workflow...")
    # This expects a real target in the Citrix window if run physically.
    step1 = ASTNode(node_id="click_target", node_type="click", parameters={"target": {"type": "image", "template": "dummy_template_for_sandbox"}})
    root = ASTNode(node_id="root", node_type="workflow")
    root.children.extend([step1])
    plan = ExecutionPlan(plan_id="p-2", workflow_id="c-002", version="1.0", root_node=root, metadata={})
    
    print("\n--- EXECUTING PHYSICAL CITRIX TRACE ---")
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
