import sys
import os

current_dir = os.path.dirname(os.path.abspath(__file__))
frameworks_dir = os.path.abspath(os.path.join(current_dir, "../../frameworks/python"))
sys.path.insert(0, frameworks_dir)

from automation_studio import step, assert_equal

@step("Failing Step")
def fail():
    assert_equal(1, 2, "Expected 1 to equal 2")

def main():
    fail()
    
if __name__ == "__main__":
    main()
