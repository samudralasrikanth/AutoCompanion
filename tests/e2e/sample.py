import sys
import os

# Add the local frameworks directory to sys.path so we can import automation_studio
current_dir = os.path.dirname(os.path.abspath(__file__))
frameworks_dir = os.path.abspath(os.path.join(current_dir, "../../frameworks/python"))
sys.path.insert(0, frameworks_dir)

from automation_studio import step, assert_equal, before_scenario, after_scenario

@before_scenario
def setup():
    print("Setting up the scenario...")

@step("Navigate to Login Page")
def navigate():
    print("Navigating...")

@step("Enter Credentials")
def login():
    print("Logging in...")
    assert_equal("user", "user", "Username matches")

@step("Verify Dashboard")
def verify():
    print("Verifying dashboard...")
    assert_equal(1, 1, "Dashboard loaded")

@after_scenario
def teardown():
    print("Tearing down...")

def main():
    setup()
    navigate()
    login()
    verify()
    teardown()
    
if __name__ == "__main__":
    main()
