import os
import json
import sys
from pydantic import ValidationError
from automationstudio.sdk.models.generated.execution import ExecutionPlan
from automationstudio.sdk.models.generated.result import ExecutionResult
from automationstudio.sdk.models.generated.errors import StructuredError
from automationstudio.sdk.models.generated.envelope import ContractEnvelope
from automationstudio.sdk.models.generated.repository import RepositoryDocument

FIXTURES_DIR = os.path.join(os.path.dirname(__file__), "../packages/automationstudio-contracts/fixtures")
VALID_DIR = os.path.join(FIXTURES_DIR, "valid")
INVALID_DIR = os.path.join(FIXTURES_DIR, "invalid")

def validate_dir(dir_path: str, should_be_valid: bool) -> bool:
    if not os.path.exists(dir_path):
        return False
        
    has_error = False
    for filename in os.listdir(dir_path):
        if not filename.endswith(".json"):
            continue
            
        file_path = os.path.join(dir_path, filename)
        with open(file_path, "r") as f:
            data = json.load(f)
            
        is_valid = True
        try:
            envelope = ContractEnvelope(**data)
            # We must also validate the payload using the correct model since envelope payload is just Any
            if envelope.contractType.value == "executionPlan":
                ExecutionPlan(**envelope.payload)
            elif envelope.contractType.value == "executionResult":
                ExecutionResult(**envelope.payload)
            elif envelope.contractType.value == "error":
                StructuredError(**envelope.payload)
            elif envelope.contractType.value == "repositoryDocument":
                RepositoryDocument(**envelope.payload)
            # Add others as needed
        except ValidationError as e:
            is_valid = False
            if should_be_valid:
                print(f"Validation mismatch in {filename}. Expected valid=True, got False\n{e}")
                has_error = True
        except Exception as e:
            is_valid = False
            if should_be_valid:
                print(f"Error parsing {filename}: {e}")
                has_error = True
                
        if is_valid != should_be_valid and not (not is_valid and not should_be_valid):
             print(f"Validation mismatch in {filename}. Expected valid={should_be_valid}, got {is_valid}")
             has_error = True
        else:
             print(f"{filename} passed validation (expected valid={should_be_valid})")
             
    return has_error

if __name__ == "__main__":
    failed = False
    if validate_dir(VALID_DIR, True):
        failed = True
    if validate_dir(INVALID_DIR, False):
        failed = True
        
    if failed:
        print("Fixture validation failed in Python.")
        sys.exit(1)
    else:
        print("All fixtures validated successfully in Python.")
