import sys
import os

current_dir = os.path.dirname(os.path.abspath(__file__))
frameworks_dir = os.path.abspath(os.path.join(current_dir, "../../frameworks/python"))
sys.path.insert(0, frameworks_dir)

from automation_studio import step

@step("Generate Artifact")
def generate_png():
    print("Writing capture.png...")
    # Just create a dummy file
    with open("capture.png", "w") as f:
        f.write("dummy png content")

def main():
    generate_png()
    
if __name__ == "__main__":
    main()
