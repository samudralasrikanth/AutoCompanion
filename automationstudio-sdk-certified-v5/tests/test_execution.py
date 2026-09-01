import pytest
from automationstudio.sdk.execution.pipeline import ExecutionPipeline
from automationstudio.sdk.execution.stages import (
    StateValidationStage, CommandTranslationStage, IdentificationStage, AdapterStage,
    VerificationStage, RecoveryStage, AuditStage
)
from automationstudio.sdk.adapters.desktop import DesktopAdapter
from automationstudio.sdk.adapters.mocks import (
    MockInputProvider, MockWindowProvider, MockProcessProvider, MockAccessibilityProvider
)
from automationstudio.sdk.models.workflow import ExecutionPlan, ASTNode
from automationstudio.sdk.runtime.context import (
    AutomationContext, ExecutionContext, WorkflowContext,
    SecurityContext, VariableContext, AuditContext, RuntimeContext
)

def build_test_context():
    return AutomationContext(
        execution=ExecutionContext(execution_id="test-run-001"),
        workflow=WorkflowContext(workflow_id="wf-1", workflow_name="notepad_test", version="1.0"),
        security=SecurityContext(run_as_user="test_user", domain="local"),
        variables=VariableContext(),
        audit=AuditContext(trace_id="tr-1", correlation_id="c-1"),
        runtime=RuntimeContext(platform="macOS", os_version="14.0", resolution="1920x1080", timezone="UTC", locale="en-US")
    )

def test_identification_fallback():
    # Setup mock adapter with failing accessibility provider
    adapter = DesktopAdapter(
        input_provider=MockInputProvider(),
        window_provider=MockWindowProvider(),
        process_provider=MockProcessProvider(),
        accessibility_provider=MockAccessibilityProvider(should_fail=True)
    )
    
    stage = IdentificationStage(adapter)
    
    from automationstudio.sdk.models.command import MouseCommand
    # Target "test" should fallback through accessibility to native
    cmd = MouseCommand(command_id="1", action="click", target_identifier="test")
    
    context = build_test_context()
    
    # Run strategy - should fallback to Visual since Native returns found=False unless we configure it otherwise.
    # Wait, our Mock NativeStrategy always returns False for everything except it explicitly checks for "fail_native".
    # Since visual, native, ocr all return False, it should throw an exception "Element not found by any strategy"
    with pytest.raises(Exception, match="Identification Failure: Element not found by any strategy"):
        stage.execute(cmd, context)

def test_pipeline_recovery_and_failure():
    adapter = DesktopAdapter(
        input_provider=MockInputProvider(),
        window_provider=MockWindowProvider(),
        process_provider=MockProcessProvider(),
        accessibility_provider=MockAccessibilityProvider()
    )
    
    pipeline = ExecutionPipeline()
    pipeline.add_stage(StateValidationStage())
    pipeline.add_stage(CommandTranslationStage())
    pipeline.add_stage(IdentificationStage(adapter))
    pipeline.add_stage(AdapterStage(adapter))
    pipeline.add_stage(VerificationStage())
    pipeline.add_stage(RecoveryStage())
    pipeline.add_stage(AuditStage())
    
    # Build a plan with a failing verification
    step = ASTNode(node_id="verify_1", node_type="verify", parameters={"state": "value", "expected": "should_fail", "target": {"type": "image", "template": "fail_template.png"}})
    root = ASTNode(node_id="root", node_type="workflow")
    root.children.append(step)
    
    plan = ExecutionPlan(plan_id="p-1", workflow_id="wf-1", version="1.0", root_node=root, metadata={})
    
    context = build_test_context()
    
    result = pipeline.execute_plan(plan, context)
    
    # Should be FAILED
    assert result.status.name == "FAILED"
    assert len(result.steps) == 1
    
    failed_step = result.steps[0]
    assert failed_step.status.name == "FAILED"
    assert failed_step.recovery_attempts == 2 # 0 + 2 retries
    
    # Verify trace log contains the failure and recovery attempts
    logs = "\n".join(failed_step.logs)
    assert "Verification FAIL" in logs
    assert "Recovery attempt 1..." in logs
    assert "Recovery attempt 2..." in logs
    assert "Recovery aborted by policy" in logs
