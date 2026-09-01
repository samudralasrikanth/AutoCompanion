from .ipc import send_event

def assert_equal(expected, actual, message=None):
    if expected != actual:
        err_msg = message or f"Expected {expected} but got {actual}"
        send_event("AssertionFailed", {"message": err_msg})
        raise AssertionError(err_msg)
    send_event("AssertionPassed", {"message": message or "assert_equal passed"})

def assert_true(condition, message=None):
    if not condition:
        err_msg = message or "Condition is not true"
        send_event("AssertionFailed", {"message": err_msg})
        raise AssertionError(err_msg)
    send_event("AssertionPassed", {"message": message or "assert_true passed"})

# We will implement the rest (assert_false, assert_contains, etc.) similarly
