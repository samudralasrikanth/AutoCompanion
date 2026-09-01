"""
Resource Manager.
Sits between execution and platform, managing perception models, network handles, memory and threads.
"""
from typing import Any, Dict, Optional
import threading
import time

class ResourceManager:
    """Deterministic resource manager that tracks loaded models and memory usage."""

    def __init__(self):
        self._models: Dict[str, Any] = {}
        self._lock = threading.Lock()
        self._load_times: Dict[str, float] = {}

    def acquire_perception_model(self, model_name: str) -> Any:
        """Loads and returns a perception model, ensuring it isn't loaded multiple times."""
        with self._lock:
            if model_name in self._models:
                return self._models[model_name]
            # Deterministic mock model load
            model = {"name": model_name, "loaded": True, "load_time": time.time()}
            self._models[model_name] = model
            self._load_times[model_name] = time.time()
            return model

    def release_perception_model(self, model_name: str) -> None:
        """Frees the perception model from memory."""
        with self._lock:
            self._models.pop(model_name, None)
            self._load_times.pop(model_name, None)

    def monitor_memory(self) -> float:
        """Returns current process memory consumption in MB."""
        try:
            import resource
            usage = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
            # On macOS ru_maxrss is in bytes, on Linux in KB
            if hasattr(resource, "RUSAGE_SELF"):
                return usage / (1024 * 1024)
        except (ImportError, AttributeError):
            pass
        return 0.0

    def get_loaded_models(self) -> list[str]:
        """Returns the names of currently loaded models."""
        with self._lock:
            return list(self._models.keys())