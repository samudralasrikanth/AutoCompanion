# Automation Studio Python Framework

This is the Python execution framework for the Automation Studio IDE.

## Usage

```python
from automation_studio import step, assert_equal

@step("Login")
def login():
    assert_equal(1, 1, "One should equal one")

def main():
    login()
```
