import pytest
from unittest.mock import patch
from automationstudio.sdk.execution.pipeline import ExecutionPipeline
from automationstudio.sdk.execution.stages import (
    StateValidationStage, CommandTranslationStage, IdentificationStage, AdapterStage,
    VerificationStage, RecoveryStage, AuditStage
)
from automationstudio.sdk.adapters.desktop import DesktopAdapter
from automationstudio.sdk.adapters.mocks import (
    MockInputProvider, MockWindowProvider, MockProcessProvider, MockAccessibilityProvider
)
from automationstudio.sdk.adapters.providers import ICaptureProvider
from automationstudio.sdk.models.workflow import ExecutionPlan, ASTNode
from automationstudio.sdk.runtime.context import (
    AutomationContext, ExecutionContext, WorkflowContext,
    SecurityContext, VariableContext, AuditContext, RuntimeContext
)

def build_test_context():
    return AutomationContext(
        execution=ExecutionContext(execution_id="reliability-test"),
        workflow=WorkflowContext(workflow_id="wf-1", workflow_name="reliability_test", version="1.0"),
        security=SecurityContext(run_as_user="test_user", domain="local"),
        variables=VariableContext(),
        audit=AuditContext(trace_id="tr-1", correlation_id="c-1"),
        runtime=RuntimeContext(platform="macOS", os_version="14.0", resolution="1920x1080", timezone="UTC", locale="en-US")
    )

from typing import Any
from automationstudio.sdk.models.capture import CaptureFrame

class MockCaptureProvider(ICaptureProvider):
    def capture(self, context: Any = None) -> CaptureFrame:
        import numpy as np
        return CaptureFrame(
            image=np.zeros((1080, 1920, 3), dtype=np.uint8),
            surface_bounds={"x": 0, "y": 0, "w": 1920, "h": 1080},
            capture_id="mock_capture_123",
            capture_bounds={"x": 0, "y": 0, "w": 1920, "h": 1080},
            window_bounds={"x": 0, "y": 0, "w": 1920, "h": 1080},
            screen_origin={"x": 0, "y": 0, "w": 0, "h": 0}
        )
    def is_available(self) -> bool:
        return True

def setup_pipeline():
    adapter = DesktopAdapter(
        input_provider=MockInputProvider(),
        window_provider=MockWindowProvider(),
        process_provider=MockProcessProvider(),
        accessibility_provider=MockAccessibilityProvider(should_fail=True),
        capture_provider=MockCaptureProvider()
    )
    
    pipeline = ExecutionPipeline()
    pipeline.add_stage(StateValidationStage())
    pipeline.add_stage(CommandTranslationStage())
    pipeline.add_stage(IdentificationStage(adapter))
    pipeline.add_stage(AdapterStage(adapter))
    pipeline.add_stage(VerificationStage(adapter))
    pipeline.add_stage(RecoveryStage(adapter=adapter))
    pipeline.add_stage(AuditStage())
    
    return pipeline

def create_plan_with_target(target: str, node_type: str = "click"):
    step = ASTNode(node_id="step_1", node_type=node_type, parameters={"target": target})
    root = ASTNode(node_id="root", node_type="workflow")
    root.children.append(step)
    return ExecutionPlan(plan_id="p-1", workflow_id="wf-1", version="1.0", root_node=root, metadata={})

@patch("automationstudio.sdk.identification.perception.match_template")
def test_scenario_1_visual_fallback(mock_match):
    mock_match.return_value = {"rectangle": {"x": 0, "y": 0, "w": 100, "h": 100}, "confidence": 0.95}
    
    pipeline = setup_pipeline()
    plan = create_plan_with_target("mock_template.png")
    context = build_test_context()
    
    result = pipeline.execute_plan(plan, context)
    assert result.status.name == "COMPLETED"
    
    logs = "\n".join(result.steps[0].logs)
    assert "Strategy: VisualStrategy" in logs

@patch("automationstudio.sdk.identification.perception.match_template")
@patch("automationstudio.sdk.identification.perception.find_text_ocr")
def test_scenario_2_ocr_fallback(mock_find_text, mock_match_template):
    mock_match_template.return_value = None
    mock_find_text.return_value = {"rectangle": {"x": 0, "y": 0, "w": 100, "h": 100}, "confidence": 0.95}
    
    pipeline = setup_pipeline()
    plan = create_plan_with_target({"text": "MockText"})
    context = build_test_context()
    
    result = pipeline.execute_plan(plan, context)
    assert result.status.name == "COMPLETED"
    
    logs = "\n".join(result.steps[0].logs)
    assert "Strategy: OCRStrategy" in logs

@patch("automationstudio.sdk.identification.perception.match_template")
@patch("automationstudio.sdk.identification.perception.find_text_ocr")
def test_scenario_3_everything_fails(mock_find_text, mock_match_template):
    mock_match_template.return_value = None
    mock_find_text.return_value = None
    
    pipeline = setup_pipeline()
    # Provide both a template and text to try both Visual and OCR
    plan = create_plan_with_target({"template_path": "foo.png", "text": "foo"})
    context = build_test_context()
    
    result = pipeline.execute_plan(plan, context)
    
    assert result.status.name == "FAILED"
    logs = "\n".join(result.steps[0].logs)
    assert "Identification Failure: Element not found by any strategy" in logs
    assert "Recovery aborted by policy" in logs

@patch("automationstudio.sdk.identification.perception.match_template")
def test_scenario_4_verification_failure_recovery(mock_match):
    mock_match.return_value = {"rectangle": {"x": 0, "y": 0, "w": 100, "h": 100}, "confidence": 0.95}
    
    pipeline = setup_pipeline()
    # Add a VerificationCommand that will fail (Adapter doesn't support generic verification, VerificationStage handles it)
    step = ASTNode(node_id="verify_1", node_type="verify", parameters={"state": "value", "expected": "should_fail", "target": {"type": "image", "template": "fail_template.png"}})
    root = ASTNode(node_id="root", node_type="workflow")
    root.children.append(step)
    plan = ExecutionPlan(plan_id="p-1", workflow_id="wf-1", version="1.0", root_node=root, metadata={})
    
    context = build_test_context()
    result = pipeline.execute_plan(plan, context)
    
    assert result.status.name == "FAILED"
    logs = "\n".join(result.steps[0].logs)
    assert "Verification FAIL" in logs
    assert "Recovery attempt 1..." in logs
    assert "Recovery attempt 2..." in logs
    assert "Recovery aborted by policy" in logs

@patch("automationstudio.sdk.identification.perception.find_text_ocr")
def test_audit_contains_everything(mock_find_text):
    mock_find_text.return_value = {"rectangle": {"x": 0, "y": 0, "w": 100, "h": 100}, "confidence": 0.95}
    
    import os
    import json
    
    pipeline = setup_pipeline()
    plan = create_plan_with_target({"text": "MockText"})
    context = build_test_context()
    
    pipeline.execute_plan(plan, context)
    
    audit_path = context.execution.state_snapshots.get("audit_path")
    assert audit_path is not None
    assert os.path.exists(audit_path)
    
    with open(audit_path, "r") as f:
        logs = json.load(f)
        
    found_ocr_log = False
    for entry in logs:
        action_str = entry.get("action", "")
        if "OCRStrategy" in action_str:
            found_ocr_log = True
            
    assert found_ocr_log, "Audit log did not contain selected IdentificationStrategy"
