import os
import json
import pytest
from unittest.mock import patch
import numpy as np
from automationstudio.sdk.execution.pipeline import ExecutionPipeline
from automationstudio.sdk.execution.stages import (
    StateValidationStage, CommandTranslationStage, IdentificationStage, AdapterStage,
    VerificationStage, RecoveryStage, AuditStage
)
from automationstudio.sdk.adapters.citrix import (
    CitrixAdapter, CitrixSessionProvider, CitrixCaptureProvider, CitrixInputProvider
)
from automationstudio.sdk.models.workflow import ExecutionPlan, ASTNode
from automationstudio.sdk.runtime.context import (
    AutomationContext, ExecutionContext, WorkflowContext,
    SecurityContext, VariableContext, AuditContext, RuntimeContext, EnvironmentCapabilities
)
from typing import Any
from automationstudio.sdk.models.locator import VisualTarget, OCRTarget, LocatorResult
from automationstudio.sdk.models.capture import CaptureFrame
from automationstudio.sdk.foundation.geometry import Rectangle

class MockCitrixCaptureProvider(CitrixCaptureProvider):
    def __init__(self, session_provider):
        self.session_provider = session_provider
        self.capture_count = 0
    def capture(self, context=None) -> CaptureFrame:
        self.capture_count += 1
        return CaptureFrame(
            image="MOCK_REAL_IMAGE",
            surface_bounds={"x": 100, "y": 100, "w": 800, "h": 600},
            capture_id=f"citrix_cap_{self.capture_count}",
            capture_bounds={"x": 0, "y": 0, "w": 1920, "h": 1080},
            window_bounds={"x": 0, "y": 0, "w": 1920, "h": 1080},
            screen_origin={"x": 0, "y": 0, "w": 0, "h": 0}
        )

def build_test_context(citrix_mode=True):
    capabilities = EnvironmentCapabilities(
        accessibility=False,
        native_controls=False,
        visual=True,
        ocr=True,
        remote_interaction=True
    ) if citrix_mode else EnvironmentCapabilities()
    
    return AutomationContext(
        execution=ExecutionContext(execution_id="citrix-test"),
        workflow=WorkflowContext(workflow_id="wf-c1", workflow_name="citrix_test", version="1.0"),
        security=SecurityContext(run_as_user="test_user", domain="local"),
        variables=VariableContext(),
        audit=AuditContext(trace_id="tr-c1", correlation_id="c-c1"),
        runtime=RuntimeContext(platform="Citrix", os_version="N/A", resolution="1920x1080", timezone="UTC", locale="en-US", capabilities=capabilities)
    )

class MockCitrixSessionProvider(CitrixSessionProvider):
    def attach(self, session_id: str) -> None:
        pass
    def get_window_bounds(self) -> dict:
        rect = Rectangle(x=10, y=10, w=1024, h=768)
        return {"window": rect, "client": rect}

class MockCitrixInputProvider(CitrixInputProvider):
    def click(self, x: int, y: int) -> None:
        pass
    def type_text(self, text: str) -> None:
        pass

def setup_pipeline():
    session_prov = MockCitrixSessionProvider()
    # Mocking capture provider to bypass actual screen grabbing
    capture_prov = MockCitrixCaptureProvider(session_prov)
    input_prov = MockCitrixInputProvider()
    
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
    pipeline.add_stage(RecoveryStage(adapter=adapter))
    pipeline.add_stage(AuditStage())
    
    return pipeline, capture_prov

def create_plan_with_target(target_value: str, expected_verification: str = "exists"):
    if "visual" in target_value:
        target = {"type": "image", "template": "test_template.png"}
    elif "ocr" in target_value:
        target = {"type": "ocr", "text": "test_text"}
    else:
        target = {"type": "image", "template": "test_template.png"}

    if expected_verification == "should_fail":
        step2 = ASTNode(node_id="verify_1", node_type="verify", parameters={"state": "exists", "expected": "should_fail", "target": {"type": "image", "template": "fail_template.png"}})
    else:
        step2 = ASTNode(node_id="verify_1", node_type="verify", parameters={"state": "exists", "expected": expected_verification, "target": target})
        
    step1 = ASTNode(node_id="step_1", node_type="click", parameters={"target": target})
    root = ASTNode(node_id="root", node_type="workflow")
    root.children.extend([step1, step2])
    return ExecutionPlan(plan_id="p-c1", workflow_id="wf-c1", version="1.0", root_node=root, metadata={})

@patch("automationstudio.sdk.identification.perception.match_template")
def test_a_accessibility_unavailable_visual_succeeds(mock_match):
    mock_match.return_value = {"rectangle": {"x": 100, "y": 100, "w": 50, "h": 25}, "confidence": 0.95}
    pipeline, _ = setup_pipeline()
    plan = create_plan_with_target("visual")
    context = build_test_context(citrix_mode=True)
    
    result = pipeline.execute_plan(plan, context)
    assert result.status.name == "COMPLETED"
    
    diags = context.execution.state_snapshots.get("identification_diagnostics", [])
    assert any("AccessibilityStrategy: SKIPPED" in d for d in diags)
    assert any("NativeStrategy: SKIPPED" in d for d in diags)
    assert any("VisualStrategy: EXECUTED - result = FOUND" in d for d in diags)

@patch("automationstudio.sdk.identification.perception.match_template")
@patch("automationstudio.sdk.identification.perception.find_text_ocr")
def test_b_visual_fails_ocr_succeeds(mock_find_text, mock_match):
    mock_match.return_value = None
    mock_find_text.return_value = {"rectangle": {"x": 150, "y": 150, "w": 80, "h": 30}, "confidence": 0.85}
    
    pipeline, _ = setup_pipeline()
    plan = create_plan_with_target("ocr")
    context = build_test_context(citrix_mode=True)
    
    result = pipeline.execute_plan(plan, context)
    assert result.status.name == "COMPLETED"
    
    diags = context.execution.state_snapshots.get("identification_diagnostics", [])
    assert any("VisualStrategy: EXECUTED - result = NOT_FOUND" in d for d in diags)
    assert any("OCRStrategy: EXECUTED - result = FOUND" in d for d in diags)

@patch("automationstudio.sdk.identification.perception.match_template")
@patch("automationstudio.sdk.identification.perception.find_text_ocr")
def test_c_visual_ocr_fail_execution_fails(mock_find_text, mock_match):
    mock_match.return_value = None
    mock_find_text.return_value = None
    
    pipeline, _ = setup_pipeline()
    plan = create_plan_with_target("visual")
    context = build_test_context(citrix_mode=True)
    
    result = pipeline.execute_plan(plan, context)
    assert result.status.name == "FAILED"
    
    assert "Identification Failure" in "\n".join(result.steps[0].logs)

@patch("automationstudio.sdk.identification.perception.match_template")
def test_d_visual_finds_target_coordinate_transform_correct(mock_match):
    mock_match.return_value = {"rectangle": {"x": 100, "y": 100, "w": 50, "h": 25}, "confidence": 0.95}
    
    pipeline, _ = setup_pipeline()
    plan = create_plan_with_target("visual")
    context = build_test_context(citrix_mode=True)
    
    result = pipeline.execute_plan(plan, context)
    assert result.status.name == "COMPLETED"
    
    transform = context.execution.state_snapshots.get("coordinate_transformation")
    assert transform is not None
    assert transform["source_space"] == "CAPTURE"
    assert transform["destination_space"] == "SCREEN"

@patch("automationstudio.sdk.identification.perception.match_template")
def test_e_input_succeeds_verification_fails_recovery(mock_match):
    # Succeeds on step_1 (click) but verification looks for something else which fails
    # Let's dynamically fail verification
    def side_effect(image, template_path, threshold):
        if "fail_template" in str(template_path):
            return None
        return {"rectangle": {"x": 100, "y": 100, "w": 50, "h": 25}, "confidence": 0.95}
    mock_match.side_effect = side_effect
    
    pipeline, capture_prov = setup_pipeline()
    plan = create_plan_with_target("visual", "should_fail")
    context = build_test_context(citrix_mode=True)
    
    result = pipeline.execute_plan(plan, context)
    assert result.status.name == "FAILED"
    assert capture_prov.capture_count > 2

@patch("automationstudio.sdk.identification.perception.match_template")
def test_f_verification_succeeds_execution_completes(mock_match):
    mock_match.return_value = {"rectangle": {"x": 100, "y": 100, "w": 50, "h": 25}, "confidence": 0.95}
    
    pipeline, capture_prov = setup_pipeline()
    plan = create_plan_with_target("visual", "exists")
    context = build_test_context(citrix_mode=True)
    
    result = pipeline.execute_plan(plan, context)
    assert result.status.name == "COMPLETED"

@patch("automationstudio.sdk.identification.perception.match_template")
def test_g_stale_capture_prevention(mock_match):
    mock_match.return_value = {"rectangle": {"x": 100, "y": 100, "w": 50, "h": 25}, "confidence": 0.95}
    
    pipeline, capture_prov = setup_pipeline()
    plan = create_plan_with_target("visual")
    context = build_test_context(citrix_mode=True)
    
    result = pipeline.execute_plan(plan, context)
    assert result.status.name == "COMPLETED"
    assert capture_prov.capture_count >= 2

@patch("automationstudio.sdk.identification.perception.match_template")
def test_i_audit_contains_complete_diagnostics(mock_match):
    mock_match.return_value = {"rectangle": {"x": 100, "y": 100, "w": 50, "h": 25}, "confidence": 0.95}
    
    pipeline, _ = setup_pipeline()
    plan = create_plan_with_target("visual")
    context = build_test_context(citrix_mode=True)
    
    pipeline.execute_plan(plan, context)
    
    audit_path = context.execution.state_snapshots.get("audit_path")
    assert audit_path is not None
    assert os.path.exists(audit_path)
    
    coord_transform = context.execution.state_snapshots.get("coordinate_transformation")
    assert coord_transform is not None
