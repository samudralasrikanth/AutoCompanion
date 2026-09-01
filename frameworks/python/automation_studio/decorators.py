import functools
from .ipc import send_event

def _wrap_lifecycle(name: str, event_prefix: str):
    def decorator(func):
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            send_event(f"{event_prefix}Started", {"name": name or func.__name__})
            try:
                result = func(*args, **kwargs)
                send_event(f"{event_prefix}Finished", {"name": name or func.__name__, "status": "passed"})
                return result
            except Exception as e:
                send_event(f"{event_prefix}Finished", {"name": name or func.__name__, "status": "failed", "error": str(e)})
                raise
        return wrapper
    return decorator

def step(name: str = None):
    return _wrap_lifecycle(name, "Step")

def before_suite(func):
    return _wrap_lifecycle(None, "BeforeSuite")(func)

def after_suite(func):
    return _wrap_lifecycle(None, "AfterSuite")(func)

def before_scenario(func):
    return _wrap_lifecycle(None, "BeforeScenario")(func)

def after_scenario(func):
    return _wrap_lifecycle(None, "AfterScenario")(func)

def before_step(func):
    return _wrap_lifecycle(None, "BeforeStep")(func)

def after_step(func):
    return _wrap_lifecycle(None, "AfterStep")(func)
