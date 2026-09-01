import sys
import importlib.util
import os
from .ipc import send_event

def main():
    if len(sys.argv) < 2:
        print("Usage: automation-python-runner <script_path>")
        sys.exit(1)

    script_path = sys.argv[1]
    
    if not os.path.exists(script_path):
        send_event("Error", {"message": f"File not found: {script_path}"})
        sys.exit(1)

    send_event("ScenarioStarted", {"path": script_path})
    
    try:
        spec = importlib.util.spec_from_file_location("scenario_module", script_path)
        module = importlib.util.module_from_spec(spec)
        sys.modules["scenario_module"] = module
        spec.loader.exec_module(module)
        
        # Typically scenarios might define a main function or we might scan for tests
        # For this prototype, we'll assume the script runs on load or we call a main()
        if hasattr(module, "main"):
            module.main()
            
        send_event("ScenarioFinished", {"path": script_path, "status": "passed"})
    except Exception as e:
        send_event("ScenarioFinished", {"path": script_path, "status": "failed", "error": str(e)})
        sys.exit(1)

if __name__ == "__main__":
    main()
