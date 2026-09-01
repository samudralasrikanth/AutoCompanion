"""
System-wide constants and enumerations.
"""

# Locator Strategies
STRATEGY_OCR = "ocr"
STRATEGY_IMAGE = "image"
STRATEGY_ANCHOR = "anchor"
STRATEGY_RELATIVE = "relative"
# Note: AI strategy is NOT here. It belongs to the AI Plugin.

# Event Names
EVENT_EXECUTION_STARTED = "execution.started"
EVENT_EXECUTION_COMPLETED = "execution.completed"
EVENT_EXECUTION_FAILED = "execution.failed"
EVENT_STAGE_STARTED = "stage.started"
EVENT_STAGE_COMPLETED = "stage.completed"
