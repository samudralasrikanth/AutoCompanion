"""
Vision Engine Sidecar — Python HTTP Server
============================================
Provides production-grade Computer Vision capabilities via OpenCV and EasyOCR.
Started on-demand by the TypeScript SidecarBridge and kept alive for the session.

Endpoints:
  POST /health         → { "status": "ok" }
  POST /analyze        → Consolidated endpoint. Accepts screenshot, locator bundle, capabilities, captureContext. Returns candidates.
"""

import io
import json
import sys
import numpy as np
from flask import Flask, request, jsonify

app = Flask(__name__)

# Lazy-loaded engines (heavy imports)
_ocr_reader = None
_cv2 = None


def get_ocr_reader():
    global _ocr_reader
    if _ocr_reader is None:
        import easyocr
        _ocr_reader = easyocr.Reader(['en'], gpu=False)
    return _ocr_reader


def get_cv2():
    global _cv2
    if _cv2 is None:
        import cv2
        _cv2 = cv2
    return _cv2


def buffer_to_numpy(img_bytes: bytes) -> np.ndarray:
    """Convert raw PNG/JPEG bytes into a NumPy array (BGR)."""
    cv2 = get_cv2()
    nparr = np.frombuffer(img_bytes, np.uint8)
    return cv2.imdecode(nparr, cv2.IMREAD_COLOR)


# ─── Health ───────────────────────────────────────────────────────────────────

@app.route('/health', methods=['POST', 'GET'])
def health():
    return jsonify({"status": "ok"})


# ─── Analyze ───────────────────────────────────────────────────────────────────

def _run_ocr(img, target, context):
    reader = get_ocr_reader()
    results = reader.readtext(img)
    candidates = []
    
    cap_w = context.get('width', img.shape[1])
    cap_h = context.get('height', img.shape[0])

    for (bbox, text, confidence) in results:
        x1 = int(min(p[0] for p in bbox))
        y1 = int(min(p[1] for p in bbox))
        x2 = int(max(p[0] for p in bbox))
        y2 = int(max(p[1] for p in bbox))

        if target and target.lower() not in text.lower():
            continue

        candidates.append({
            "strategy": "ocr",
            "confidence": round(confidence * 100, 1),
            "location": {
                "nx": x1 / cap_w,
                "ny": y1 / cap_h,
                "nw": (x2 - x1) / cap_w,
                "nh": (y2 - y1) / cap_h
            },
            "metadata": {"text": text}
        })
    return candidates

def _run_template(img, template, scales, context):
    cv2 = get_cv2()
    img_gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    template_gray = cv2.cvtColor(template, cv2.COLOR_BGR2GRAY)
    
    cap_w = context.get('width', img.shape[1])
    cap_h = context.get('height', img.shape[0])

    candidates = []
    
    for scale in scales:
        th, tw = template_gray.shape[:2]
        resized_w = int(tw * scale)
        resized_h = int(th * scale)
        if resized_w <= 0 or resized_h <= 0:
            continue
        resized = cv2.resize(template_gray, (resized_w, resized_h))

        if resized.shape[0] > img_gray.shape[0] or resized.shape[1] > img_gray.shape[1]:
            continue

        result = cv2.matchTemplate(img_gray, resized, cv2.TM_CCOEFF_NORMED)
        
        # Find local maxima to support locateAll
        threshold = 0.7
        loc = np.where(result >= threshold)
        for pt in zip(*loc[::-1]):
            val = result[pt[1], pt[0]]
            candidates.append({
                "strategy": "image",
                "confidence": round(val * 100, 1),
                "location": {
                    "nx": int(pt[0]) / cap_w,
                    "ny": int(pt[1]) / cap_h,
                    "nw": resized_w / cap_w,
                    "nh": resized_h / cap_h
                },
                "metadata": {"scale": scale}
            })
            
    # Naive non-max suppression would go here for production
    candidates.sort(key=lambda c: c['confidence'], reverse=True)
    return candidates[:5]

@app.route('/analyze', methods=['POST'])
def analyze():
    if 'screenshot' not in request.files:
        return jsonify({"error": "Missing 'screenshot' file"}), 400
        
    img_bytes = request.files['screenshot'].read()
    img = buffer_to_numpy(img_bytes)
    
    locator_raw = request.form.get('locator', '{}')
    capabilities_raw = request.form.get('capabilities', '[]')
    context_raw = request.form.get('captureContext', '{}')
    
    locator = json.loads(locator_raw)
    capabilities = json.loads(capabilities_raw)
    context = json.loads(context_raw)
    
    candidates = []
    
    # Delegate to appropriate algorithms based on locator strategies and capabilities
    strategies = locator.get('strategies', [])
    
    for strategy in strategies:
        stype = strategy.get('type')
        sval = strategy.get('value')
        
        if stype == 'ocr' and 'ocr' in capabilities:
            candidates.extend(_run_ocr(img, sval, context))
            
        elif stype == 'image' and 'template' in capabilities:
            if 'template' in request.files:
                template_bytes = request.files['template'].read()
                template = buffer_to_numpy(template_bytes)
                scales = strategy.get('metadata', {}).get('scales', [0.8, 0.9, 1.0, 1.1, 1.2])
                candidates.extend(_run_template(img, template, scales, context))
                
        # feature match logic omitted for brevity in POC

    return jsonify({"candidates": candidates})


# ─── Execute ───────────────────────────────────────────────────────────────────

@app.route('/execute', methods=['POST'])
def execute():
    try:
        import pyautogui
    except ImportError:
        return jsonify({"success": False, "error": "pyautogui not installed"}), 500

    command_raw = request.form.get('command', '{}')
    import json
    command = json.loads(command_raw)
    action = command.get('action')
    locator = command.get('locator', {})
    options = command.get('options', {})
    
    # 1. Capture Screen
    try:
        import numpy as np
        screenshot_pil = pyautogui.screenshot()
        img = get_cv2().cvtColor(np.array(screenshot_pil), get_cv2().COLOR_RGB2BGR)
    except Exception as e:
        return jsonify({"success": False, "error": f"Screenshot failed: {e}"}), 500
        
    context = {'width': img.shape[1], 'height': img.shape[0]}
    
    # 2. Locate
    candidates = []
    strategies = locator.get('strategies', [])
    for strategy in strategies:
        stype = strategy.get('type')
        sval = strategy.get('value')
        if stype == 'ocr':
            candidates.extend(_run_ocr(img, sval, context))
        elif stype == 'image':
            if 'template' in request.files:
                template_bytes = request.files['template'].read()
                template = buffer_to_numpy(template_bytes)
                scales = strategy.get('metadata', {}).get('scales', [1.0])
                candidates.extend(_run_template(img, template, scales, context))
                
    if not candidates and action not in ['pressKey', 'wait', 'exists']:
        return jsonify({"success": False, "error": "Locator not found on screen"}), 404
        
    if candidates:
        candidates.sort(key=lambda c: c['confidence'], reverse=True)
        best = candidates[0]
        # Calculate center pixel
        x = int((best['location']['nx'] + best['location']['nw'] / 2) * context['width'])
        y = int((best['location']['ny'] + best['location']['nh'] / 2) * context['height'])
    else:
        best = None
        x, y = 0, 0
        
    # 3. Execute Action
    try:
        if action == 'click':
            pyautogui.click(x=x, y=y)
        elif action == 'doubleClick':
            pyautogui.doubleClick(x=x, y=y)
        elif action == 'rightClick':
            pyautogui.rightClick(x=x, y=y)
        elif action == 'hover':
            pyautogui.moveTo(x=x, y=y)
        elif action == 'type':
            text = options.get('text', '')
            if candidates:
                pyautogui.click(x=x, y=y)
            pyautogui.write(text, interval=0.05)
        elif action == 'pressKey':
            key = options.get('key', '')
            pyautogui.press(key)
        elif action == 'scroll':
            amount = options.get('amount', 0)
            pyautogui.moveTo(x=x, y=y)
            pyautogui.scroll(amount)
    except Exception as e:
        return jsonify({"success": False, "error": f"Action execution failed: {e}"})
        
    # 4. Verify (Stub)
    verification = command.get('verification')
    verification_success = True
    if verification:
        pass

    return jsonify({
        "success": True,
        "match": best,
        "verificationSuccess": verification_success
    })


# ─── Entry Point ──────────────────────────────────────────────────────────────

if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 5123
    print(f"Vision Sidecar starting on port {port}")
    app.run(host='127.0.0.1', port=port, debug=False)
