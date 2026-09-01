from typing import List, Dict, Optional, Any
from automationstudio.sdk.models.generated.adapter import AdapterContract
from automationstudio.sdk.models.generated.execution import ActionDefinition

class AdapterConflictError(Exception):
    pass

class AdapterNotFoundError(Exception):
    pass

class AdapterRegistry:
    def __init__(self):
        self._adapters: List[AdapterContract] = []

    def register(self, adapter: AdapterContract):
        self._adapters.append(adapter)

    def select_adapter(self, action: ActionDefinition) -> AdapterContract:
        candidates = []
        for adapter in self._adapters:
            # simple capability/support check based on the schema
            action_type_str = action.type.value
            if action_type_str in adapter.supportedActionTypes:
                # Assuming target object evaluation can be more complex, but for now we just check if it claims support
                candidates.append(adapter)

        if not candidates:
            raise AdapterNotFoundError(f"No adapter found for action type '{action.type.value}'")

        # Select by highest priority (assuming higher number is higher priority)
        max_priority = max(adapter.priority for adapter in candidates)
        top_candidates = [a for a in candidates if a.priority == max_priority]

        if len(top_candidates) > 1:
            ids = [a.id for a in top_candidates]
            raise AdapterConflictError(
                f"Multiple adapters with priority {max_priority} matched action '{action.type.value}': {ids}. "
                f"Adapter selection must be deterministic."
            )

        return top_candidates[0]
