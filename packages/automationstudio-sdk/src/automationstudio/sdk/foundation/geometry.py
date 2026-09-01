from pydantic import BaseModel
from typing import Optional
from enum import Enum

class Rectangle(BaseModel):
    x: int
    y: int
    w: int
    h: int

class CoordinateSpace(str, Enum):
    SCREEN = "SCREEN"
    WINDOW = "WINDOW"
    SURFACE = "SURFACE"
    CAPTURE = "CAPTURE"

class CoordinateTranslator:
    @staticmethod
    def _validate_rect(rect: Rectangle, frame, space_name: str) -> None:
        """Validate that a rectangle is within the bounds of the given space."""
        if rect.x < 0 or rect.y < 0 or rect.w < 0 or rect.h < 0:
            raise ValueError(f"Invalid rectangle in {space_name} space: {rect}")
        if rect.x + rect.w > frame.capture_bounds.w:
            raise ValueError(f"Rectangle exceeds {space_name} width bounds: {rect}")
        if rect.y + rect.h > frame.capture_bounds.h:
            raise ValueError(f"Rectangle exceeds {space_name} height bounds: {rect}")

    @staticmethod
    def capture_to_screen(capture_rect: Rectangle, frame) -> Rectangle:
        """Transforms a capture-space coordinate to screen-space."""
        # Validate capture rect is within capture bounds
        CoordinateTranslator._validate_rect(capture_rect, frame, "capture")

        scaled_x = int(capture_rect.x * frame.scale_factor)
        scaled_y = int(capture_rect.y * frame.scale_factor)

        return Rectangle(
            x=scaled_x + frame.screen_origin.x + frame.window_bounds.x + frame.surface_bounds.x,
            y=scaled_y + frame.screen_origin.y + frame.window_bounds.y + frame.surface_bounds.y,
            w=int(capture_rect.w * frame.scale_factor),
            h=int(capture_rect.h * frame.scale_factor)
        )

    @staticmethod
    def screen_to_capture(screen_rect: Rectangle, frame) -> Rectangle:
        """Transforms a screen-space coordinate to capture-space."""
        # Reverse the translation
        unscaled_x = screen_rect.x - frame.screen_origin.x - frame.window_bounds.x - frame.surface_bounds.x
        unscaled_y = screen_rect.y - frame.screen_origin.y - frame.window_bounds.y - frame.surface_bounds.y

        if frame.scale_factor == 0:
            raise ValueError("scale_factor cannot be zero")

        return Rectangle(
            x=int(unscaled_x / frame.scale_factor),
            y=int(unscaled_y / frame.scale_factor),
            w=int(screen_rect.w / frame.scale_factor),
            h=int(screen_rect.h / frame.scale_factor)
        )

    @staticmethod
    def window_to_screen(window_rect: Rectangle, frame) -> Rectangle:
        """Transforms a window-space coordinate to screen-space."""
        return Rectangle(
            x=window_rect.x + frame.window_bounds.x,
            y=window_rect.y + frame.window_bounds.y,
            w=window_rect.w,
            h=window_rect.h
        )

    @staticmethod
    def surface_to_screen(surface_rect: Rectangle, frame) -> Rectangle:
        """Transforms a surface-space coordinate to screen-space."""
        return Rectangle(
            x=surface_rect.x + frame.surface_bounds.x + frame.window_bounds.x,
            y=surface_rect.y + frame.surface_bounds.y + frame.window_bounds.y,
            w=surface_rect.w,
            h=surface_rect.h
        )