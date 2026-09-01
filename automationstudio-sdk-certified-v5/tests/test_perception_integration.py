import os
import pytest
from automationstudio.sdk.identification.perception import match_template, find_text_ocr

FIXTURE_DIR = os.path.join(os.path.dirname(__file__), "fixtures", "citrix")

def check_dependencies():
    try:
        import cv2
    except ImportError:
        pytest.skip("OpenCV not installed")
    try:
        import pytesseract
    except ImportError:
        pytest.skip("pytesseract not installed")

def test_visual_template_matching_happy_path():
    check_dependencies()
    login_screen = os.path.join(FIXTURE_DIR, "login_screen.png")
    save_button = os.path.join(FIXTURE_DIR, "save_button.png")
    
    if not os.path.exists(login_screen) or not os.path.exists(save_button):
        pytest.skip("Fixture images not found")

    res = match_template(login_screen, save_button, threshold=0.9)
    assert res is not None, "Failed to find save button in login screen"
    
    rect = res["rectangle"]
    assert rect["w"] == 100
    assert rect["h"] == 50
    # Expected location 350, 250
    assert rect["x"] == 350
    assert rect["y"] == 250
    assert res["confidence"] >= 0.9

def test_visual_template_matching_negative_path_absent():
    check_dependencies()
    login_screen = os.path.join(FIXTURE_DIR, "login_screen.png")
    absent_template = os.path.join(FIXTURE_DIR, "absent_template.png") # We will create a dummy
    
    if not os.path.exists(login_screen):
        pytest.skip("Fixture images not found")

    if not os.path.exists(absent_template):
        import cv2, numpy as np
        # Create a random noise square which shouldn't match anything in login_screen
        img = np.random.randint(0, 256, (20, 20, 3), dtype=np.uint8)
        cv2.imwrite(absent_template, img)
        
    res = match_template(login_screen, absent_template, threshold=0.9)
    assert res is None, "Should not find an absent template"

def test_visual_template_matching_negative_path_threshold():
    check_dependencies()
    login_screen = os.path.join(FIXTURE_DIR, "login_screen.png")
    save_button = os.path.join(FIXTURE_DIR, "save_button.png")
    
    if not os.path.exists(login_screen) or not os.path.exists(save_button):
        pytest.skip("Fixture images not found")

    # Unrealistic threshold should fail (exactly 1 is possible, but > 1 is impossible)
    res = match_template(login_screen, save_button, threshold=1.0001)
    assert res is None, "Should not find template with impossible threshold"

def test_ocr_text_finding_happy_path():
    check_dependencies()
    login_screen = os.path.join(FIXTURE_DIR, "login_screen.png")
    
    if not os.path.exists(login_screen):
        pytest.skip("Fixture image not found")

    try:
        res = find_text_ocr(login_screen, "Login")
        assert res is not None, "Failed to find 'Login' text via OCR"
        rect = res["rectangle"]
        assert rect["w"] > 0
        assert rect["h"] > 0
        assert res["confidence"] > 0
    except Exception as e:
        if "Tesseract binary not found" in str(e):
            pytest.skip("Tesseract binary not found")
        raise

def test_ocr_text_finding_negative_path():
    check_dependencies()
    login_screen = os.path.join(FIXTURE_DIR, "login_screen.png")
    
    if not os.path.exists(login_screen):
        pytest.skip("Fixture image not found")

    try:
        res = find_text_ocr(login_screen, "NonExistentGibberishText123")
        assert res is None, "Should not find non-existent text"
    except Exception as e:
        if "Tesseract binary not found" in str(e):
            pytest.skip("Tesseract binary not found")
        raise
