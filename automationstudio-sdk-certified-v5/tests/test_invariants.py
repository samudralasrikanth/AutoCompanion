import pytest
import sys
from unittest.mock import patch, MagicMock

from automationstudio.sdk.execution.pipeline import ExecutionPipeline
from automationstudio.sdk.execution.stages import (
    StateValidationStage, CommandTranslationStage, IdentificationStage, AdapterStage,
    VerificationStage, RecoveryStage, AuditStage
)
from automationstudio.sdk.adapters.citrix import CitrixAdapter
from automationstudio.sdk.models.workflow import ExecutionPlan, ASTNode
from automationstudio.sdk.runtime.context import (
    AutomationContext, ExecutionContext, WorkflowContext,
    SecurityContext, VariableContext, AuditContext, RuntimeContext, EnvironmentCapabilities
)
from automationstudio.sdk.models.capture import CaptureFrame
from automationstudio.sdk.models.locator import LocatorResult, CoordinateSpace
from automationstudio.sdk.foundation.geometry import Rectangle
from automationstudio.sdk.foundation.exceptions import AbortPipelineError, StaleLocatorError

def build_test_context():
    capabilities = EnvironmentCapabilities(visual=True, ocr=True)
    return AutomationContext(
        execution=ExecutionContext(execution_id="invariant-test"),
        workflow=WorkflowContext(workflow_id="wf-inv", workflow_name="invariant_test", version="1.0"),
        security=SecurityContext(run_as_user="test_user", domain="local"),
        variables=VariableContext(),
        audit=AuditContext(trace_id="tr-inv", correlation_id="c-inv"),
        runtime=RuntimeContext(platform="Windows", os_version="10", resolution="1920x1080", timezone="UTC", locale="en-US", capabilities=capabilities)
    )

def test_unsupported_command_aborts_without_retry():
    context = build_test_context()
    
    # Setup mock adapter that explicitly returns NOT_SUPPORTED
    adapter = MagicMock()
    adapter.execute_command.return_value = {"status": "NOT_SUPPORTED", "provider": "MockProvider"}
    
    pipeline = ExecutionPipeline()
    recovery_stage = RecoveryStage(adapter=adapter)
    # Spy on RecoveryStage
    recovery_stage.execute = MagicMock(wraps=recovery_stage.execute)
    
    pipeline.add_stage(AdapterStage(adapter))
    pipeline.add_stage(recovery_stage)
    
    step1 = ASTNode(node_id="step_1", node_type="click", parameters={"target": "foo"})
    root = ASTNode(node_id="root", node_type="workflow", children=[step1])
    plan = ExecutionPlan(plan_id="p-inv", workflow_id="wf-inv", version="1.0", root_node=root, metadata={})
    
    result = pipeline.execute_plan(plan, context)
    
    assert result.status.name == "FAILED"
    recovery_stage.execute.assert_not_called()
    assert "AbortPipelineError" in "\n".join(result.steps[0].logs)

def test_abort_never_reaches_recovery_retry():
    # Same as above but specifically verifying exception type
    context = build_test_context()
    adapter = MagicMock()
    adapter.execute_command.side_effect = AbortPipelineError("Fatal abort")
    
    pipeline = ExecutionPipeline()
    recovery_stage = RecoveryStage(adapter=adapter)
    recovery_stage.execute = MagicMock(wraps=recovery_stage.execute)
    
    pipeline.add_stage(AdapterStage(adapter))
    pipeline.add_stage(recovery_stage)
    
    step1 = ASTNode(node_id="step_1", node_type="click", parameters={"target": "foo"})
    root = ASTNode(node_id="root", node_type="workflow", children=[step1])
    plan = ExecutionPlan(plan_id="p-inv", workflow_id="wf-inv", version="1.0", root_node=root, metadata={})
    
    result = pipeline.execute_plan(plan, context)
    
    assert result.status.name == "FAILED"
    recovery_stage.execute.assert_not_called()

def test_stale_locator_rejected_before_physical_input():
    from automationstudio.sdk.adapters.citrix import CitrixAdapter
    from automationstudio.sdk.models.command import MouseCommand
    
    context = build_test_context()
    capture_frame = CaptureFrame(
        capture_id="active-capture-1",
        image="img",
        capture_bounds=Rectangle(x=0,y=0,w=100,h=100),
        surface_bounds=Rectangle(x=0,y=0,w=100,h=100),
        window_bounds=Rectangle(x=0,y=0,w=100,h=100),
        screen_origin=Rectangle(x=0,y=0,w=0,h=0)
    )
    context.execution.active_capture = capture_frame
    
    locator = LocatorResult(found=True, capture_id="stale-capture-2", rectangle=Rectangle(x=10, y=10, w=10, h=10))
    command = MouseCommand(command_id="c1", action="click", target_identifier=locator)
    
    input_provider = MagicMock()
    adapter = CitrixAdapter(session_provider=MagicMock(), capture_provider=MagicMock(), input_provider=input_provider)
    
    with pytest.raises(StaleLocatorError):
        adapter.execute_command(command, context)
        
    input_provider.click.assert_not_called()

def test_adapter_uses_active_capture():
    from automationstudio.sdk.adapters.citrix import CitrixAdapter
    from automationstudio.sdk.models.command import MouseCommand
    
    context = build_test_context()
    capture_frame = CaptureFrame(
        capture_id="active-capture-1",
        image="img",
        capture_bounds=Rectangle(x=0,y=0,w=100,h=100),
        surface_bounds=Rectangle(x=0,y=0,w=100,h=100),
        window_bounds=Rectangle(x=0,y=0,w=100,h=100),
        screen_origin=Rectangle(x=0,y=0,w=0,h=0)
    )
    context.execution.active_capture = capture_frame
    
    locator = LocatorResult(found=True, capture_id="active-capture-1", rectangle=Rectangle(x=10, y=10, w=10, h=10))
    command = MouseCommand(command_id="c1", action="click", target_identifier=locator)
    
    capture_provider = MagicMock()
    input_provider = MagicMock()
    adapter = CitrixAdapter(session_provider=MagicMock(), capture_provider=capture_provider, input_provider=input_provider)
    
    adapter.execute_command(command, context)
    input_provider.click.assert_called_once()

def test_adapter_does_not_generate_second_capture():
    from automationstudio.sdk.adapters.citrix import CitrixAdapter
    from automationstudio.sdk.models.command import MouseCommand
    
    context = build_test_context()
    capture_frame = CaptureFrame(
        capture_id="active-capture-1",
        image="img",
        capture_bounds=Rectangle(x=0,y=0,w=100,h=100),
        surface_bounds=Rectangle(x=0,y=0,w=100,h=100),
        window_bounds=Rectangle(x=0,y=0,w=100,h=100),
        screen_origin=Rectangle(x=0,y=0,w=0,h=0)
    )
    context.execution.active_capture = capture_frame
    
    locator = LocatorResult(found=True, capture_id="active-capture-1", rectangle=Rectangle(x=10, y=10, w=10, h=10))
    command = MouseCommand(command_id="c1", action="click", target_identifier=locator)
    
    capture_provider = MagicMock()
    adapter = CitrixAdapter(session_provider=MagicMock(), capture_provider=capture_provider, input_provider=MagicMock())
    
    adapter.execute_command(command, context)
    capture_provider.capture.assert_not_called()

def test_sendinput_partial_result_fails():
    if sys.platform != "win32":
        pytest.skip("Windows only test")
        
    from automationstudio.sdk.adapters.windows_providers import WindowsCitrixInputProvider
    provider = WindowsCitrixInputProvider()
    
    with patch("ctypes.windll.user32.SendInput") as mock_sendinput:
        mock_sendinput.return_value = 1 # We expect 3 for click
        
        with pytest.raises(RuntimeError) as exc:
            provider.click(10, 10)
            
        assert "expected 3" in str(exc.value)
        assert "returned 1" in str(exc.value)

def test_sendinput_full_result_succeeds():
    if sys.platform != "win32":
        pytest.skip("Windows only test")
        
    from automationstudio.sdk.adapters.windows_providers import WindowsCitrixInputProvider
    provider = WindowsCitrixInputProvider()
    
    with patch("ctypes.windll.user32.SendInput") as mock_sendinput:
        mock_sendinput.return_value = 3 # 3 inputs
        
        with patch("ctypes.windll.user32.GetSystemMetrics") as mock_metrics:
            mock_metrics.return_value = 1000
            
            provider.click(10, 10) # Should succeed silently
