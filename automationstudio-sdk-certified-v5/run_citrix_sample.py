"""
Sample script to execute automation against a physical Citrix session.
This is meant to be run directly on a Windows host with an active Citrix session.
"""
import sys
import time

def main():
    print("Initializing Citrix Automation Adapter...")
    try:
        from automationstudio.sdk.adapters.citrix import (
            CitrixAdapter, CitrixSessionProvider, CitrixCaptureProvider, CitrixInputProvider
        )
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
        
    print("Creating Pipeline with Citrix Adapters...")
    
    session_prov = CitrixSessionProvider()
    capture_prov = CitrixCaptureProvider(session_prov)
    input_prov = CitrixInputProvider()
    
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
    
    # Configure context to explicitly use Citrix capabilities
    capabilities = EnvironmentCapabilities(
        accessibility=False,
        native_controls=False,
        visual=True,
        ocr=True,
        remote_interaction=True
    )
    
    context = AutomationContext(
        execution=ExecutionContext(execution_id="real-citrix-001"),
        workflow=WorkflowContext(workflow_id="c-001", workflow_name="citrix_test", version="1.0"),
        security=SecurityContext(run_as_user="bot", domain="local"),
        variables=VariableContext(),
        audit=AuditContext(trace_id="tr-1", correlation_id="cor-1"),
        runtime=RuntimeContext(platform="Citrix", os_version="Windows", resolution="1920x1080", timezone="UTC", locale="en-US", capabilities=capabilities)
    )
    
    print("Constructing deterministic workflow...")
    # SUCCESS TRACE
    step1 = ASTNode(node_id="click_customer_id", node_type="click", parameters={"target": {"type": "image", "template": "customer_id.png"}})
    step2 = ASTNode(node_id="verify_customer_id", node_type="verify", parameters={"state": "exists", "expected": "exists", "target": {"type": "image", "template": "customer_id.png"}})
    root = ASTNode(node_id="root", node_type="workflow")
    root.children.extend([step1, step2])
    plan = ExecutionPlan(plan_id="p-1", workflow_id="c-001", version="1.0", root_node=root, metadata={})
    
    print("\n--- EXECUTING SUCCESS TRACE ---")
    start_time = time.time()
    result = pipeline.execute_plan(plan, context)
    end_time = time.time()
    
    print(f"\nExecution Complete: {result.status.name} (Duration: {end_time - start_time:.2f}s)")
    for step in result.steps:
        print(f"Step {step.action_id} - {step.status.name}")
        for log in step.logs:
            print(f"  > {log}")

    # FAILURE TRACE (Recovery loop)
    # Verification failure triggers recovery loop
    step_fail_1 = ASTNode(node_id="click_customer_id_2", node_type="click", parameters={"target": {"type": "image", "template": "customer_id.png"}})
    step_fail_2 = ASTNode(node_id="verify_customer_id_fail", node_type="verify", parameters={"state": "exists", "expected": "exists", "target": {"type": "image", "template": "nonexistent.png"}})
    root_fail = ASTNode(node_id="root", node_type="workflow")
    root_fail.children.extend([step_fail_1, step_fail_2])
    plan_fail = ExecutionPlan(plan_id="p-fail", workflow_id="c-002", version="1.0", root_node=root_fail, metadata={})
    
    print("\n--- EXECUTING FAILURE TRACE (Recovery Loop) ---")
    start_time = time.time()
    result_fail = pipeline.execute_plan(plan_fail, context)
    end_time = time.time()
    
    print(f"\nExecution Complete: {result_fail.status.name} (Duration: {end_time - start_time:.2f}s)")
    for step in result_fail.steps:
        print(f"Step {step.action_id} - {step.status.name}")
        for log in step.logs:
            print(f"  > {log}")
            
    print(f"\nAudit Log: {result.artifacts.get('audit_log')}")
    
if __name__ == "__main__":
    main()
