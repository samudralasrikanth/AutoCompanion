from automationstudio.sdk.models.capture import CaptureFrame
from automationstudio.sdk.foundation.geometry import Rectangle
from automationstudio.sdk.surface import SurfaceRuntime


def frame(identifier):
    return CaptureFrame(
        capture_id=identifier,
        capture_bounds=Rectangle(x=0, y=0, w=200, h=100),
        surface_bounds=Rectangle(x=0, y=0, w=200, h=100),
        window_bounds=Rectangle(x=0, y=0, w=200, h=100),
        screen_origin=Rectangle(x=0, y=0, w=0, h=0),
    )


class CaptureProvider:
    def __init__(self):
        self.count = 0

    def capture(self, _context):
        self.count += 1
        return frame(f"capture-{self.count}")


class AccessibilityProvider:
    def find_element(self, _target):
        return None


class MockAdapter:
    def __init__(self, fail=False):
        self.capture_provider = CaptureProvider()
        self.accessibility_provider = AccessibilityProvider()
        self.fail = fail

    def execute_command(self, _command, _context):
        if self.fail:
            raise RuntimeError("mock input failure")
        return {"status": "SUCCESS", "provider": "MockInput"}


def coordinate_workflow():
    return {
        "workflow": {"name": "surface-test", "version": "1.0"},
        "steps": [{
            "click": {
                "target": {
                    "locators": [
                        {"type": "uia", "value": "missing"},
                        {"type": "coordinate", "value": {"x": 20, "y": 30}},
                    ]
                }
            }
        }],
    }


def test_surface_locator_fallback_is_deterministic(tmp_path):
    adapter = MockAdapter()
    result = SurfaceRuntime(adapter=adapter, artifact_dir=str(tmp_path), max_retries=0).run(coordinate_workflow())

    assert result.status.value == "completed"
    assert result.steps[0].verification_passed is False
    assert any(item.get("strategy") == "CoordinateStrategy" for item in result.steps[0].trace)
    assert adapter.capture_provider.count == 1


def test_surface_recovery_is_bounded_per_step(tmp_path):
    adapter = MockAdapter(fail=True)
    result = SurfaceRuntime(adapter=adapter, artifact_dir=str(tmp_path), max_retries=2).run(coordinate_workflow())

    assert result.status.value == "failed"
    assert result.steps[0].recovery_attempts == 2
    assert len([item for item in result.steps[0].trace if item.get("status") == "recovery"]) == 3
    assert result.steps[0].trace[-1]["status"] == "aborted"
