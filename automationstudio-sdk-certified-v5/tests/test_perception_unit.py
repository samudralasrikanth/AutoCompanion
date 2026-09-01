import pytest
from unittest.mock import patch
from automationstudio.sdk.identification.strategies import VisualStrategy, OCRStrategy
from automationstudio.sdk.models.locator import VisualTarget, OCRTarget
from automationstudio.sdk.models.capture import CaptureFrame
from automationstudio.sdk.foundation.geometry import Rectangle

@patch("automationstudio.sdk.identification.perception.match_template")
def test_visual_strategy_deterministic_flow(mock_match):
    mock_match.return_value = {"rectangle": {"x": 50, "y": 50, "w": 20, "h": 20}, "confidence": 0.98}
    
    strategy = VisualStrategy()
    target = VisualTarget(template_path="dummy.png", threshold=0.90)
    frame = CaptureFrame(
            image="dummy_image_data",
            surface_bounds={"x":0, "y":0, "w":1920, "h":1080},
            capture_id="cap_1",
            capture_bounds={"x": 0, "y": 0, "w": 1920, "h": 1080},
            window_bounds={"x": 0, "y": 0, "w": 1920, "h": 1080},
            screen_origin={"x": 0, "y": 0, "w": 0, "h": 0}
        )
    
    res = strategy.identify(target, context=None, capture_frame=frame)
    assert res.found is True
    assert res.strategy_used == "VisualStrategy"
    assert res.capture_id == "cap_1"
    assert res.rectangle.x == 50
    assert res.rectangle.w == 20
    assert res.confidence == 0.98
    
    # Assert args
    mock_match.assert_called_once_with("dummy_image_data", "dummy.png", 0.90)

@patch("automationstudio.sdk.identification.perception.match_template")
def test_visual_strategy_error_handling(mock_match):
    mock_match.side_effect = Exception("OpenCV Error")
    
    strategy = VisualStrategy()
    target = VisualTarget(template_path="dummy.png")
    frame = CaptureFrame(
            image="dummy_image_data",
            surface_bounds={"x":0, "y":0, "w":1920, "h":1080},
            capture_id="cap_2",
            capture_bounds={"x": 0, "y": 0, "w": 1920, "h": 1080},
            window_bounds={"x": 0, "y": 0, "w": 1920, "h": 1080},
            screen_origin={"x": 0, "y": 0, "w": 0, "h": 0}
        )
    
    res = strategy.identify(target, context=None, capture_frame=frame)
    assert res.found is False
    assert "OpenCV Error" in res.diagnostics.get("error", "")

@patch("automationstudio.sdk.identification.perception.find_text_ocr")
def test_ocr_strategy_deterministic_flow(mock_ocr):
    mock_ocr.return_value = {"rectangle": {"x": 10, "y": 10, "w": 40, "h": 10}, "confidence": 0.85}
    
    strategy = OCRStrategy()
    target = OCRTarget(text="Login")
    frame = CaptureFrame(
            image="dummy_image_data",
            surface_bounds={"x":0, "y":0, "w":1920, "h":1080},
            capture_id="cap_3",
            capture_bounds={"x": 0, "y": 0, "w": 1920, "h": 1080},
            window_bounds={"x": 0, "y": 0, "w": 1920, "h": 1080},
            screen_origin={"x": 0, "y": 0, "w": 0, "h": 0}
        )
    
    res = strategy.identify(target, context=None, capture_frame=frame)
    assert res.found is True
    assert res.strategy_used == "OCRStrategy"
    assert res.capture_id == "cap_3"
    assert res.rectangle.x == 10
    
    mock_ocr.assert_called_once_with("dummy_image_data", "Login")

def test_strategy_fails_without_capture_frame():
    strategy = VisualStrategy()
    target = VisualTarget(template_path="dummy.png")
    res = strategy.identify(target, context=None, capture_frame=None)
    assert res.found is False
    assert "No capture frame" in res.diagnostics.get("error", "")
