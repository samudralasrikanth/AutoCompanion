import sys
import uuid
import numpy as np
from typing import Any
from ..foundation.geometry import Rectangle
from ..models.capture import CaptureFrame
from .citrix import CitrixSessionProvider, CitrixCaptureProvider, CitrixInputProvider

class WindowsCitrixSessionProvider(CitrixSessionProvider):
    def __init__(self):
        self.hwnd = None
        self.window_title = None
        self.dpi_awareness_mode = "UNAWARE"

    def _set_dpi_awareness(self):
        import ctypes
        if sys.platform != "win32":
            return
        try:
            # Per-Monitor V2
            ctypes.windll.shcore.SetProcessDpiAwareness(2) # type: ignore
            self.dpi_awareness_mode = "PER_MONITOR_V2"
        except Exception:
            try:
                # Fallback to system DPI awareness
                ctypes.windll.user32.SetProcessDPIAware() # type: ignore
                self.dpi_awareness_mode = "SYSTEM_DPI_AWARE"
            except Exception as fallback_e:
                raise RuntimeError(f"Failed to establish any DPI awareness mode on Windows: {fallback_e}")

    def attach(self, session_id: str) -> None:
        self.window_title = session_id
        if sys.platform != "win32":
            return
            
        import ctypes
        from ctypes import wintypes
        
        self._set_dpi_awareness()
        
        candidates = []
        
        def enum_windows_callback(hwnd, lParam):
            if not ctypes.windll.user32.IsWindowVisible(hwnd): # type: ignore
                return True
                
            length = ctypes.windll.user32.GetWindowTextLengthW(hwnd) # type: ignore
            if length == 0:
                return True
                
            buff = ctypes.create_unicode_buffer(length + 1)
            ctypes.windll.user32.GetWindowTextW(hwnd, buff, length + 1) # type: ignore
            
            if self.window_title in buff.value:
                # Check minimum dimensions to rule out ghost/minimized windows
                rect = wintypes.RECT()
                ctypes.windll.user32.GetWindowRect(hwnd, ctypes.byref(rect)) # type: ignore
                w = rect.right - rect.left
                h = rect.bottom - rect.top
                if w > 100 and h > 100:
                    candidates.append(hwnd)
                    
            return True

        EnumWindowsProc = ctypes.WINFUNCTYPE(ctypes.c_bool, wintypes.HWND, wintypes.LPARAM) # type: ignore
        ctypes.windll.user32.EnumWindows(EnumWindowsProc(enum_windows_callback), 0) # type: ignore
        
        if len(candidates) == 0:
            raise RuntimeError(f"Citrix window '{self.window_title}' not found. Cannot fallback.")
        elif len(candidates) > 1:
            raise RuntimeError(f"AmbiguousCitrixSession: found {len(candidates)} windows matching '{self.window_title}'.")
            
        self.hwnd = candidates[0]

    def get_window_bounds(self) -> dict:
        """Returns both outer window bounds and inner client bounds."""
        if sys.platform != "win32":
            raise NotImplementedError("WindowsCitrixSessionProvider requires win32")
            
        if not self.hwnd:
            raise RuntimeError("Citrix session not attached or window not found.")
            
        import ctypes
        from ctypes import wintypes
        
        rect = wintypes.RECT()
        ctypes.windll.user32.GetWindowRect(self.hwnd, ctypes.byref(rect)) # type: ignore
        window_bounds = Rectangle(
            x=rect.left,
            y=rect.top,
            w=rect.right - rect.left,
            h=rect.bottom - rect.top
        )
        
        client_rect = wintypes.RECT()
        ctypes.windll.user32.GetClientRect(self.hwnd, ctypes.byref(client_rect)) # type: ignore
        pt = wintypes.POINT(0, 0)
        ctypes.windll.user32.ClientToScreen(self.hwnd, ctypes.byref(pt)) # type: ignore
        
        client_bounds = Rectangle(
            x=pt.x,
            y=pt.y,
            w=client_rect.right - client_rect.left,
            h=client_rect.bottom - client_rect.top
        )
        
        return {
            "window_bounds": window_bounds,
            "client_bounds": client_bounds
        }

class WindowsCitrixCaptureProvider(CitrixCaptureProvider):
    def __init__(self, session_provider: CitrixSessionProvider):
        self.session_provider = session_provider
        self._sct = None
        self.capture_count = 0

    @property
    def sct(self):
        if self._sct is None:
            import mss
            self._sct = mss.mss()
        return self._sct

    def capture(self, context: Any) -> CaptureFrame:
        self.capture_count += 1
        
        # Query the actual Citrix session bounds
        bounds_dict = self.session_provider.get_window_bounds()
        
        # Grab specifically the region bounded by the Citrix client area
        monitor = self.sct.monitors[0] # Monitor 0 is the virtual monitor containing all screens
        
        if bounds_dict and isinstance(bounds_dict, dict) and "client_bounds" in bounds_dict:
            client_bounds = bounds_dict["client_bounds"]
            window_bounds = bounds_dict["window_bounds"]
            bbox = {
                "left": client_bounds.x,
                "top": client_bounds.y,
                "width": client_bounds.w,
                "height": client_bounds.h
            }
        elif bounds_dict and isinstance(bounds_dict, Rectangle):
            # Fallback if subclass hasn't updated
            bbox = {
                "left": bounds_dict.x,
                "top": bounds_dict.y,
                "width": bounds_dict.w,
                "height": bounds_dict.h
            }
            window_bounds = bounds_dict
            client_bounds = bounds_dict
        else:
            raise RuntimeError("Cannot capture: no valid Citrix window bounds available")
            
        sct_img = self.sct.grab(bbox)
        
        # Convert to numpy array in BGR format for OpenCV
        img_np = np.array(sct_img)
        # Drop the alpha channel if present
        if len(img_np.shape) == 3 and img_np.shape[2] == 4:
            img_np = img_np[:, :, :3]
            
        return CaptureFrame(
            capture_id=f"citrix_real_{self.capture_count}_{uuid.uuid4().hex[:8]}",
            image=img_np,
            capture_bounds=Rectangle(x=0, y=0, w=bbox["width"], h=bbox["height"]),
            surface_bounds=Rectangle(x=client_bounds.x - window_bounds.x, y=client_bounds.y - window_bounds.y, w=client_bounds.w, h=client_bounds.h),
            window_bounds=Rectangle(x=window_bounds.x, y=window_bounds.y, w=window_bounds.w, h=window_bounds.h),
            screen_origin=Rectangle(x=0, y=0, w=0, h=0)
        )

class WindowsCitrixInputProvider(CitrixInputProvider):
    def click(self, x: int, y: int) -> None:
        if sys.platform != "win32":
            print(f"[WindowsCitrixInputProvider] SKIPPED: Not on Windows (Requested click at {x}, {y})")
            return
            
        import ctypes
        
        # We need to map screen coordinates to absolute coordinates for SendInput (0 to 65535)
        # We get the virtual screen size first
        SM_XVIRTUALSCREEN = 76
        SM_YVIRTUALSCREEN = 77
        SM_CXVIRTUALSCREEN = 78
        SM_CYVIRTUALSCREEN = 79
        
        v_x = ctypes.windll.user32.GetSystemMetrics(SM_XVIRTUALSCREEN) # type: ignore
        v_y = ctypes.windll.user32.GetSystemMetrics(SM_YVIRTUALSCREEN) # type: ignore
        v_w = ctypes.windll.user32.GetSystemMetrics(SM_CXVIRTUALSCREEN) # type: ignore
        v_h = ctypes.windll.user32.GetSystemMetrics(SM_CYVIRTUALSCREEN) # type: ignore
        
        if v_w == 0 or v_h == 0:
            return
            
        abs_x = int(((x - v_x) * 65535) / v_w)
        abs_y = int(((y - v_y) * 65535) / v_h)
        
        class MOUSEINPUT(ctypes.Structure):
            _fields_ = (("dx", ctypes.c_long),
                        ("dy", ctypes.c_long),
                        ("mouseData", ctypes.c_ulong),
                        ("dwFlags", ctypes.c_ulong),
                        ("time", ctypes.c_ulong),
                        ("dwExtraInfo", ctypes.POINTER(ctypes.c_ulong)))

        class INPUT_I(ctypes.Union):
            _fields_ = (("mi", MOUSEINPUT),
                        ("ki", ctypes.c_ulong * 6),
                        ("hi", ctypes.c_ulong * 4))

        class INPUT(ctypes.Structure):
            _fields_ = (("type", ctypes.c_ulong),
                        ("ii", INPUT_I))

        INPUT_MOUSE = 0
        MOUSEEVENTF_MOVE = 0x0001
        MOUSEEVENTF_ABSOLUTE = 0x8000
        MOUSEEVENTF_VIRTUALDESK = 0x4000
        MOUSEEVENTF_LEFTDOWN = 0x0002
        MOUSEEVENTF_LEFTUP = 0x0004

        inputs = (INPUT * 3)()
        
        # Move
        inputs[0].type = INPUT_MOUSE
        inputs[0].ii.mi = MOUSEINPUT(abs_x, abs_y, 0, MOUSEEVENTF_MOVE | MOUSEEVENTF_ABSOLUTE | MOUSEEVENTF_VIRTUALDESK, 0, None)
        
        # Left down
        inputs[1].type = INPUT_MOUSE
        inputs[1].ii.mi = MOUSEINPUT(abs_x, abs_y, 0, MOUSEEVENTF_LEFTDOWN | MOUSEEVENTF_ABSOLUTE | MOUSEEVENTF_VIRTUALDESK, 0, None)
        
        # Left up
        inputs[2].type = INPUT_MOUSE
        inputs[2].ii.mi = MOUSEINPUT(abs_x, abs_y, 0, MOUSEEVENTF_LEFTUP | MOUSEEVENTF_ABSOLUTE | MOUSEEVENTF_VIRTUALDESK, 0, None)
        
        sent = ctypes.windll.user32.SendInput(len(inputs), ctypes.byref(inputs), ctypes.sizeof(INPUT)) # type: ignore
        if sent != len(inputs):
            raise RuntimeError(f"SendInput failed: expected {len(inputs)}, returned {sent}")
        
    def type_text(self, text: str) -> None:
        if sys.platform != "win32":
            print(f"[WindowsCitrixInputProvider] SKIPPED: Not on Windows (Requested typing '{text}')")
            return
            
        import ctypes
        class KEYBDINPUT(ctypes.Structure):
            _fields_ = (("wVk", ctypes.c_ushort),
                        ("wScan", ctypes.c_ushort),
                        ("dwFlags", ctypes.c_ulong),
                        ("time", ctypes.c_ulong),
                        ("dwExtraInfo", ctypes.POINTER(ctypes.c_ulong)))

        class INPUT_I(ctypes.Union):
            _fields_ = (("ki", KEYBDINPUT),
                        ("mi", ctypes.c_ulong * 7),
                        ("hi", ctypes.c_ulong * 4))

        class INPUT(ctypes.Structure):
            _fields_ = (("type", ctypes.c_ulong),
                        ("ii", INPUT_I))

        INPUT_KEYBOARD = 1
        KEYEVENTF_UNICODE = 0x0004
        KEYEVENTF_KEYUP = 0x0002

        inputs = (INPUT * (len(text) * 2))()
        for i, char in enumerate(text):
            # Key down
            inputs[i * 2].type = INPUT_KEYBOARD
            inputs[i * 2].ii.ki = KEYBDINPUT(0, ord(char), KEYEVENTF_UNICODE, 0, None)
            
            # Key up
            inputs[i * 2 + 1].type = INPUT_KEYBOARD
            inputs[i * 2 + 1].ii.ki = KEYBDINPUT(0, ord(char), KEYEVENTF_UNICODE | KEYEVENTF_KEYUP, 0, None)
            
        sent = ctypes.windll.user32.SendInput(len(inputs), ctypes.byref(inputs), ctypes.sizeof(INPUT)) # type: ignore
        if sent != len(inputs):
            raise RuntimeError(f"SendInput failed: expected {len(inputs)}, returned {sent}")
