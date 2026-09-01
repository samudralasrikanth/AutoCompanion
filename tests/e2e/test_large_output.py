import sys
import os

current_dir = os.path.dirname(os.path.abspath(__file__))
frameworks_dir = os.path.abspath(os.path.join(current_dir, "../../frameworks/python"))
sys.path.insert(0, frameworks_dir)

from automation_studio import step

@step("Spam Logs")
def spam():
    for i in range(10000):
        print(f"Log message {i}")

def main():
    spam()
    
if __name__ == "__main__":
    main()
