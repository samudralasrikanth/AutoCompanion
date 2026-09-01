import sys
import os
import time
import json

current_dir = os.path.dirname(os.path.abspath(__file__))
frameworks_dir = os.path.abspath(os.path.join(current_dir, "../../frameworks/python"))
sys.path.insert(0, frameworks_dir)

from automation_studio import step

@step("Mixed Output")
def mixed_output():
    print("Standard Log line 1")
    # Simulate manual/corrupted IPC
    print("Standard Log line 2 __AUTO_IPC__" + json.dumps({"type": "DummyEvent", "payload": {}}))
    # Corrupt JSON
    print("__AUTO_IPC__{bad json")

@step("Hang")
def hang():
    # Only hang if an env var is set to prevent normal runs from blocking forever
    if os.environ.get("TEST_HANG") == "1":
        print("Hanging forever...")
        while True:
            time.sleep(1)
            
@step("Missing Import")
def missing_import():
    if os.environ.get("TEST_CRASH") == "1":
        import this_module_does_not_exist

def main():
    mixed_output()
    missing_import()
    hang()

if __name__ == "__main__":
    main()
