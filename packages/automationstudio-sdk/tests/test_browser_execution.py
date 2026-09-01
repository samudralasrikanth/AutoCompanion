import pytest
import os
from pathlib import Path
from automationstudio.sdk.adapters.playwright_provider import (
    PlaywrightState,
    PlaywrightSessionProvider,
    PlaywrightDomProvider,
    PlaywrightInputProvider,
    PlaywrightWaitProvider,
    PlaywrightCaptureProvider,
    PlaywrightVerificationProvider
)
from automationstudio.sdk.adapters.browser import BrowserAdapter
from automationstudio.sdk.models.command import (
    NavigationCommand,
    KeyboardCommand,
    MouseCommand,
    VerificationCommand,
    Command
)
from automationstudio.sdk.models.browser import (
    StaleDomElementError,
    WaitTimeoutError
)

# FAIL explicitly if playwright is missing, do NOT skip.
try:
    import playwright
except ImportError:
    pytest.fail("Playwright is missing. Browser certification requires Playwright to be installed.")

@pytest.fixture
def browser_adapter():
    state = PlaywrightState()
    # Explicitly verify we can start it
    state.ensure_playwright()
    
    adapter = BrowserAdapter(
        session_provider=PlaywrightSessionProvider(state),
        capture_provider=PlaywrightCaptureProvider(state),
        input_provider=PlaywrightInputProvider(state),
        dom_provider=PlaywrightDomProvider(state),
        wait_provider=PlaywrightWaitProvider(state),
        verification_provider=PlaywrightVerificationProvider(state)
    )
    yield adapter
    
    if adapter.active_session_id:
        adapter.session_provider.close(adapter.active_session_id)
    if state.playwright:
        state.playwright.stop()

@pytest.fixture
def fixture_url():
    fixture_path = Path(__file__).parent / "fixtures" / "browser" / "index.html"
    return f"file://{fixture_path.absolute()}"

def test_unsupported_command_handling(browser_adapter):
    class UnknownCommand(Command):
        action: str = "magic"
        
    with pytest.raises(NotImplementedError):
        browser_adapter.execute(UnknownCommand(action="magic"))

def test_browser_launch_and_navigate(browser_adapter, fixture_url):
    # Launch
    result = browser_adapter.execute(NavigationCommand(action="launch_app", arguments="chromium", uri=fixture_url))
    assert result["status"] == "SUCCESS"
    assert "session_id" in result
    
    # Verify title
    result = browser_adapter.execute(VerificationCommand(
        verification_type="text",
        target_identifier={"type": "css", "selector": "h1"},
        expected_value="Browser Test Fixture"
    ))
    assert result["status"] == "PASS"

def test_dom_interaction_and_verification(browser_adapter, fixture_url):
    browser_adapter.execute(NavigationCommand(action="launch_app", arguments="chromium", uri=fixture_url))
    
    # Type text
    browser_adapter.execute(KeyboardCommand(
        action="type",
        target_identifier={"type": "css", "selector": "#text-input"},
        text="Hello SDK"
    ))
    
    # Verify value
    result = browser_adapter.execute(VerificationCommand(
        verification_type="value",
        target_identifier={"type": "css", "selector": "#text-input"},
        expected_value="Hello SDK"
    ))
    assert result["status"] == "PASS"
    
    # Checkbox check
    browser_adapter.execute(MouseCommand(
        action="click",
        target_identifier={"type": "css", "selector": "#checkbox-input"}
    ))
    
    # Verify checked
    result = browser_adapter.execute(VerificationCommand(
        verification_type="checked",
        target_identifier={"type": "css", "selector": "#checkbox-input"}
    ))
    assert result["status"] == "PASS"

def test_wait_timeouts(browser_adapter, fixture_url):
    browser_adapter.execute(NavigationCommand(action="launch_app", arguments="chromium", uri=fixture_url))
    
    # Expect WaitTimeoutError when waiting for non-existent element
    with pytest.raises(WaitTimeoutError):
        # We simulate a wait timeout by passing a short timeout directly or catching the wait
        # Our adapter currently maps `verification_type="visible"` to a wait with default 30s timeout
        # For the test, we'll invoke the provider directly to pass a short timeout
        browser_adapter.wait_provider.wait_for_condition(
            frame_id=browser_adapter.active_frame_id,
            condition="visible",
            selector="#does-not-exist",
            timeout_ms=100
        )

def test_stale_element_rejection_on_navigation(browser_adapter, fixture_url):
    browser_adapter.execute(NavigationCommand(action="launch_app", arguments="chromium", uri=fixture_url))
    
    # Identify element
    element = browser_adapter._resolve_element({"type": "css", "selector": "#submit-button"})
    
    # Navigate (Same page via hash to trigger framenavigated)
    browser_adapter.execute(NavigationCommand(action="navigate_url", uri=fixture_url + "#navigated"))
    
    # Give Playwright a tiny moment to process the navigation event and bump generation
    import time
    time.sleep(0.5)
    
    # Attempt to click stale element
    with pytest.raises(StaleDomElementError):
        browser_adapter.execute(MouseCommand(
            action="click",
            target_identifier=element
        ))

def test_dynamic_behavior(browser_adapter, fixture_url):
    browser_adapter.execute(NavigationCommand(action="launch_app", arguments="chromium", uri=fixture_url))
    
    # Element is hidden initially
    result = browser_adapter.execute(VerificationCommand(
        verification_type="hidden",
        target_identifier={"type": "css", "selector": "#async-element"}
    ))
    assert result["status"] == "PASS"
    
    # Trigger dynamic
    browser_adapter.execute(MouseCommand(
        action="click",
        target_identifier={"type": "css", "selector": "#trigger-dynamic"}
    ))
    
    # Wait for it to become visible
    browser_adapter.execute(VerificationCommand(
        verification_type="visible",
        target_identifier={"type": "css", "selector": "#async-element"}
    ))
    
    # Verify enabled state changed
    result = browser_adapter.execute(VerificationCommand(
        verification_type="enabled",
        target_identifier={"type": "css", "selector": "#async-enabled-button"}
    ))
    assert result["status"] == "PASS"
