"""
Playwright-specific provider implementations.
"""
import uuid
import time
from typing import Dict, Any, Optional
from datetime import datetime

try:
    from playwright.sync_api import sync_playwright, Browser, BrowserContext, Page, Frame, Locator
except ImportError:
    pass  # Let it fail cleanly when instantiated rather than blocking import completely if not installed

from ...models.browser import (
    BrowserSession, 
    BrowserTab, 
    BrowserFrame, 
    DomElement, 
    BrowserCaptureFrame,
    StaleDomElementError,
    InvalidBrowserSessionError,
    InvalidBrowserFrameError,
    WaitTimeoutError
)
from .browser_providers import (
    BrowserSessionProvider,
    BrowserCaptureProvider,
    BrowserInputProvider,
    BrowserDomProvider,
    BrowserWaitProvider
)

class PlaywrightState:
    """Singleton-like or shared state container mapping IDs to physical Playwright objects."""
    def __init__(self):
        self.playwright = None
        self.browsers: Dict[str, Browser] = {}
        self.contexts: Dict[str, BrowserContext] = {}
        self.pages: Dict[str, Page] = {}
        self.frames: Dict[str, Frame] = {}
        self.locators: Dict[str, Locator] = {}
        
        # Generation trackers
        self.page_generations: Dict[str, int] = {}
        self.frame_generations: Dict[str, int] = {}

    def ensure_playwright(self):
        if not self.playwright:
            try:
                from playwright.sync_api import sync_playwright
                self.playwright_context = sync_playwright()
                self.playwright = self.playwright_context.start()
            except ImportError:
                raise RuntimeError("Playwright is not installed. Required for Playwright providers.")

class PlaywrightSessionProvider(BrowserSessionProvider):
    def __init__(self, state: PlaywrightState):
        self.state = state

    def launch(self, browser_type: str = "chromium", headless: bool = True) -> BrowserSession:
        self.state.ensure_playwright()
        
        if browser_type == "chromium":
            browser = self.state.playwright.chromium.launch(headless=headless)
        elif browser_type == "firefox":
            browser = self.state.playwright.firefox.launch(headless=headless)
        elif browser_type == "webkit":
            browser = self.state.playwright.webkit.launch(headless=headless)
        else:
            raise ValueError(f"Unsupported browser_type: {browser_type}")
            
        session_id = f"sess_{uuid.uuid4().hex[:8]}"
        context = browser.new_context()
        
        self.state.browsers[session_id] = browser
        self.state.contexts[session_id] = context
        
        return BrowserSession(
            session_id=session_id,
            browser_type=browser_type
        )
        
    def close(self, session_id: str) -> None:
        if session_id in self.state.browsers:
            self.state.browsers[session_id].close()
            del self.state.browsers[session_id]
            del self.state.contexts[session_id]

    def new_tab(self, session_id: str) -> BrowserTab:
        if session_id not in self.state.contexts:
            raise InvalidBrowserSessionError(f"Session {session_id} not found.")
            
        context = self.state.contexts[session_id]
        page = context.new_page()
        
        tab_id = f"tab_{uuid.uuid4().hex[:8]}"
        self.state.pages[tab_id] = page
        self.state.page_generations[tab_id] = 1
        
        # In Playwright, the main page is also the root frame.
        self.state.frames[tab_id] = page.main_frame
        self.state.frame_generations[tab_id] = 1
        
        # Listen to navigations to bump generation
        def on_framenavigated(frame: Frame):
            if frame == page.main_frame:
                self.state.page_generations[tab_id] = self.state.page_generations.get(tab_id, 0) + 1
            # We would need a more sophisticated mapping to track all child frames and their IDs
            # For simplicity, if it's the main frame, we bump the tab generation.
        
        page.on("framenavigated", on_framenavigated)
        
        return BrowserTab(
            tab_id=tab_id,
            session_id=session_id,
            url=page.url,
            title=page.title(),
            page_generation=self.state.page_generations[tab_id]
        )

    def close_tab(self, tab_id: str) -> None:
        if tab_id in self.state.pages:
            self.state.pages[tab_id].close()
            del self.state.pages[tab_id]
            
    def navigate(self, tab_id: str, url: str) -> BrowserTab:
        if tab_id not in self.state.pages:
            raise InvalidBrowserFrameError(f"Tab {tab_id} not found.")
            
        page = self.state.pages[tab_id]
        page.goto(url)
        
        return self.get_tab(tab_id)

    def get_session(self, session_id: str) -> BrowserSession:
        if session_id not in self.state.browsers:
            raise InvalidBrowserSessionError(f"Session {session_id} not found.")
        return BrowserSession(session_id=session_id, browser_type="unknown")

    def get_tab(self, tab_id: str) -> BrowserTab:
        if tab_id not in self.state.pages:
            raise InvalidBrowserFrameError(f"Tab {tab_id} not found.")
        page = self.state.pages[tab_id]
        return BrowserTab(
            tab_id=tab_id,
            session_id="unknown", # We'd need to map back to session_id in a complete impl
            url=page.url,
            title=page.title(),
            page_generation=self.state.page_generations[tab_id]
        )

    def get_frame(self, frame_id: str) -> BrowserFrame:
        if frame_id not in self.state.frames:
            raise InvalidBrowserFrameError(f"Frame {frame_id} not found.")
        frame = self.state.frames[frame_id]
        return BrowserFrame(
            frame_id=frame_id,
            tab_id="unknown",
            url=frame.url,
            frame_generation=self.state.frame_generations.get(frame_id, 1)
        )


class PlaywrightDomProvider(BrowserDomProvider):
    def __init__(self, state: PlaywrightState):
        self.state = state

    def identify(self, frame_id: str, strategy: str, selector: str) -> DomElement:
        if frame_id not in self.state.frames:
            raise InvalidBrowserFrameError(f"Frame {frame_id} not found.")
            
        frame = self.state.frames[frame_id]
        
        if strategy == "css":
            locator = frame.locator(selector)
        elif strategy == "xpath":
            locator = frame.locator(f"xpath={selector}")
        elif strategy == "role":
            locator = frame.get_by_role(selector)
        elif strategy == "text":
            locator = frame.get_by_text(selector)
        elif strategy == "label":
            locator = frame.get_by_label(selector)
        elif strategy == "placeholder":
            locator = frame.get_by_placeholder(selector)
        elif strategy == "test_id":
            locator = frame.get_by_test_id(selector)
        else:
            raise ValueError(f"Unsupported locator strategy: {strategy}")
            
        element_id = f"el_{uuid.uuid4().hex[:8]}"
        self.state.locators[element_id] = locator
        
        # For this prototype, we'll assume tab_id == frame_id for the main frame.
        # A more robust mapping is needed for nested iframes.
        tab_id = frame_id
        
        return DomElement(
            element_id=element_id,
            session_id="unknown",
            tab_id=tab_id,
            frame_id=frame_id,
            selector=selector,
            strategy=strategy,
            page_generation=self.state.page_generations.get(tab_id, 1),
            frame_generation=self.state.frame_generations.get(frame_id, 1)
        )


class PlaywrightWaitProvider(BrowserWaitProvider):
    def __init__(self, state: PlaywrightState):
        self.state = state
        
    def wait_for_condition(self, frame_id: str, condition: str, selector: Optional[str] = None, timeout_ms: int = 30000) -> None:
        if frame_id not in self.state.frames:
            raise InvalidBrowserFrameError(f"Frame {frame_id} not found.")
            
        frame = self.state.frames[frame_id]
        
        from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
        
        try:
            if condition == "network_idle":
                # Assuming frame_id == tab_id for page-level network idle
                page = self.state.pages.get(frame_id)
                if page:
                    page.wait_for_load_state("networkidle", timeout=timeout_ms)
            elif condition == "visible" and selector:
                frame.locator(selector).wait_for(state="visible", timeout=timeout_ms)
            elif condition == "hidden" and selector:
                frame.locator(selector).wait_for(state="hidden", timeout=timeout_ms)
            elif condition == "attached" and selector:
                frame.locator(selector).wait_for(state="attached", timeout=timeout_ms)
            else:
                raise ValueError(f"Unsupported wait condition: {condition}")
        except PlaywrightTimeoutError:
            raise WaitTimeoutError(f"Timeout waiting for {condition} on {selector}")


class PlaywrightInputProvider(BrowserInputProvider):
    def __init__(self, state: PlaywrightState):
        self.state = state

    def _validate_element(self, element: DomElement) -> Locator:
        if element.element_id not in self.state.locators:
            raise RuntimeError(f"Element {element.element_id} not found in physical state.")
            
        current_page_gen = self.state.page_generations.get(element.tab_id, 1)
        current_frame_gen = self.state.frame_generations.get(element.frame_id, 1)
        
        if element.page_generation != current_page_gen:
            raise StaleDomElementError(f"Element is stale. Page generation advanced: {element.page_generation} -> {current_page_gen}")
            
        if element.frame_generation != current_frame_gen:
            raise StaleDomElementError(f"Element is stale. Frame generation advanced: {element.frame_generation} -> {current_frame_gen}")
            
        return self.state.locators[element.element_id]

    def click(self, element: DomElement) -> None:
        locator = self._validate_element(element)
        locator.click()

    def type_text(self, element: DomElement, text: str) -> None:
        locator = self._validate_element(element)
        locator.fill(text)

    def check(self, element: DomElement) -> None:
        locator = self._validate_element(element)
        locator.check()

    def uncheck(self, element: DomElement) -> None:
        locator = self._validate_element(element)
        locator.uncheck()

    def select_option(self, element: DomElement, value: str) -> None:
        locator = self._validate_element(element)
        locator.select_option(value)


class PlaywrightCaptureProvider(BrowserCaptureProvider):
    def __init__(self, state: PlaywrightState):
        self.state = state
        self.capture_count = 0

    def capture(self, tab_id: str, include_screenshot: bool = True, include_dom: bool = False) -> BrowserCaptureFrame:
        if tab_id not in self.state.pages:
            raise InvalidBrowserFrameError(f"Tab {tab_id} not found.")
            
        page = self.state.pages[tab_id]
        
        self.capture_count += 1
        screenshot_bytes = None
        
        if include_screenshot:
            screenshot_bytes = page.screenshot(type="png")
            
        return BrowserCaptureFrame(
            capture_id=f"bw_cap_{self.capture_count}",
            session_id="unknown",
            tab_id=tab_id,
            frame_id=tab_id,
            url=page.url,
            page_generation=self.state.page_generations.get(tab_id, 1),
            screenshot=screenshot_bytes
        )

class PlaywrightVerificationProvider(BrowserVerificationProvider):
    def __init__(self, state: PlaywrightState):
        self.state = state
        
    def _validate_element(self, element: DomElement) -> Locator:
        if element.element_id not in self.state.locators:
            raise RuntimeError(f"Element {element.element_id} not found in physical state.")
            
        current_page_gen = self.state.page_generations.get(element.tab_id, 1)
        current_frame_gen = self.state.frame_generations.get(element.frame_id, 1)
        
        if element.page_generation != current_page_gen:
            raise StaleDomElementError(f"Element is stale. Page generation advanced: {element.page_generation} -> {current_page_gen}")
            
        if element.frame_generation != current_frame_gen:
            raise StaleDomElementError(f"Element is stale. Frame generation advanced: {element.frame_generation} -> {current_frame_gen}")
            
        return self.state.locators[element.element_id]

    def verify_state(self, element: DomElement, condition: str, expected_value: Optional[Any] = None) -> bool:
        locator = self._validate_element(element)
        
        if condition == "visible":
            return locator.is_visible()
        elif condition == "hidden":
            return locator.is_hidden()
        elif condition == "enabled":
            return locator.is_enabled()
        elif condition == "disabled":
            return locator.is_disabled()
        elif condition == "checked":
            return locator.is_checked()
        elif condition == "text":
            return locator.inner_text() == expected_value
        elif condition == "value":
            return locator.input_value() == expected_value
        else:
            raise ValueError(f"Unsupported verification condition: {condition}")

