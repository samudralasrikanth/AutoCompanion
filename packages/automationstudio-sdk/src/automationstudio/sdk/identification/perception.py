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
