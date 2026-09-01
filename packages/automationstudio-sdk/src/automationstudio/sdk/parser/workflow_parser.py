"""
Workflow Parser.
Supports YAML (preferred) and JSON (backward compatibility).
"""
import json
import yaml
from typing import Dict, Any

class WorkflowParser:
    def parse_file(self, filepath: str) -> Dict[str, Any]:
        """Parses a workflow file into a raw dictionary."""
        with open(filepath, 'r', encoding='utf-8') as f:
            if filepath.endswith('.yaml') or filepath.endswith('.yml'):
                return yaml.safe_load(f)
            elif filepath.endswith('.json'):
                return json.load(f)
            else:
                raise ValueError(f"Unsupported workflow format: {filepath}")
