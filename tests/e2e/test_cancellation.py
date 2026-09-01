import sys
import os
import time

current_dir = os.path.dirname(os.path.abspath(__file__))
frameworks_dir = os.path.abspath(os.path.join(current_dir, "../../frameworks/python"))
sys.path.insert(0, frameworks_dir)

from automation_studio import step

@step("Long Wait Step")
def wait_long():
    print("Waiting for 20 seconds...")
    time.sleep(20)
    print("Finished waiting")

def main():
    wait_long()
    
if __name__ == "__main__":
    main()
