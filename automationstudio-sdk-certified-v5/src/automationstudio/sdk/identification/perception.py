"""
Perception logic using OpenCV and Tesseract.
"""
import time
from typing import Optional, Dict, Any

def match_template(image_buffer: Any, template_path: str, threshold: float = 0.90) -> Optional[Dict[str, Any]]:
    try:
        import cv2
        import numpy as np
    except ImportError:
        raise RuntimeError("Visual capability unavailable: OpenCV is not installed")

    # In a real scenario, image_buffer would be a path, bytes, or numpy array.
    # For now, we will assume it's a file path or a numpy array.
    if isinstance(image_buffer, str):
        img = cv2.imread(image_buffer)
    else:
        # Assuming numpy array
        img = image_buffer
        
    if img is None:
        return None

    template = cv2.imread(template_path)
    if template is None:
        raise ValueError(f"Template not found: {template_path}")

    res = cv2.matchTemplate(img, template, cv2.TM_CCOEFF_NORMED)
    min_val, max_val, min_loc, max_loc = cv2.minMaxLoc(res)
    
    if max_val >= threshold:
        h, w = template.shape[:2]
        return {
            "rectangle": {"x": max_loc[0], "y": max_loc[1], "w": w, "h": h},
            "confidence": float(max_val)
        }
    return None

def find_text_ocr(image_buffer: Any, text: str) -> Optional[Dict[str, Any]]:
    try:
        import pytesseract
        from pytesseract import TesseractNotFoundError
    except ImportError:
        raise RuntimeError("OCR capability unavailable: pytesseract is not installed")

    if isinstance(image_buffer, str):
        import cv2
        img = cv2.imread(image_buffer)
    else:
        img = image_buffer

    if img is None:
        return None

    try:
        data = pytesseract.image_to_data(img, output_type=pytesseract.Output.DICT)
    except TesseractNotFoundError:
        raise RuntimeError("OCR capability unavailable: Tesseract binary not found")
        
    for i in range(len(data['text'])):
        if text.lower() in data['text'][i].lower():
            # Found text
            x, y, w, h = data['left'][i], data['top'][i], data['width'][i], data['height'][i]
            conf = data['conf'][i]
            if float(conf) > 0: # Filter out bad results
                return {
                    "rectangle": {"x": x, "y": y, "w": w, "h": h},
                    "confidence": float(conf) / 100.0
                }
    return None

def find_control_visual(image_buffer: Any, control_type: str) -> Optional[Dict[str, Any]]:
    """Detects control shapes using OpenCV when OCR fails or isn't applicable."""
    try:
        import cv2
        import numpy as np
    except ImportError:
        raise RuntimeError("Visual capability unavailable: OpenCV is not installed")

    if isinstance(image_buffer, str):
        img = cv2.imread(image_buffer)
    else:
        img = image_buffer

    if img is None:
        return None

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    edges = cv2.Canny(gray, 50, 150, apertureSize=3)
    contours, _ = cv2.findContours(edges, cv2.RETR_TREE, cv2.CHAIN_APPROX_SIMPLE)
    
    best_match = None
    max_area = 0
    target = control_type.lower()
    
    for cnt in contours:
        area = cv2.contourArea(cnt)
        if area < 100:
            continue
            
        approx = cv2.approxPolyDP(cnt, 0.04 * cv2.arcLength(cnt, True), True)
        x, y, w, h = cv2.boundingRect(approx)
        aspect_ratio = float(w)/h if h > 0 else 0
        
        is_match = False
        if "button" in target or "input" in target:
            # Buttons and inputs are typically wider rectangles
            if len(approx) >= 4 and 1.5 <= aspect_ratio <= 10.0:
                is_match = True
        elif "checkbox" in target:
            # Checkboxes are typically small squares
            if len(approx) >= 4 and 0.8 <= aspect_ratio <= 1.2 and area < 1500:
                is_match = True
        elif "radio" in target:
            # Radio buttons are typically small circles (> 6 vertices approx)
            if len(approx) > 6 and 0.8 <= aspect_ratio <= 1.2 and area < 1500:
                is_match = True
        else:
            # Generic fallback: just any reasonably sized rectangle
            if len(approx) >= 4 and area > 500:
                is_match = True
                
        if is_match and area > max_area:
            max_area = area
            best_match = {"x": x, "y": y, "w": w, "h": h}
            
    if best_match:
        return {
            "rectangle": best_match,
            "confidence": 0.8
        }
    return None
