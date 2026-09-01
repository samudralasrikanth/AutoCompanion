import sys
import json
import time

def send_event(event_type: str, payload: dict = None):
    """
    Sends an execution event to the Node.js runtime over stdout.
    The Node runtime captures stdout and looks for __AUTO_IPC__ markers.
    """
    if payload is None:
        payload = {}
        
    message = {
        "__AUTO_IPC__": True,
        "event": {
            "version": "1.0",
            "type": event_type,
            "payload": payload,
            "metadata": {
                "timestamp": int(time.time() * 1000),
                "source": "python"
            }
        }
    }
    
    # Write as a single line JSON to prevent interleaving issues
    sys.stdout.write(json.dumps(message) + "\n")
    sys.stdout.flush()
