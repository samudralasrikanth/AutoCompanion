"""
Retry policies for Recovery strategies.
"""
from typing import Protocol
from enum import Enum

class RecoveryDecision(str, Enum):
    RETRY = "retry"
    ABORT = "abort"


class IRetryPolicy(Protocol):
    def next_delay_ms(self, attempt: int) -> int:
        ...

class LinearRetryPolicy(IRetryPolicy):
    def __init__(self, delay_ms: int = 1000):
        self.delay_ms = delay_ms
        
    def next_delay_ms(self, attempt: int) -> int:
        return self.delay_ms

class ExponentialRetryPolicy(IRetryPolicy):
    def __init__(self, base_ms: int = 1000, factor: float = 2.0):
        self.base_ms = base_ms
        self.factor = factor
        
    def next_delay_ms(self, attempt: int) -> int:
        return int(self.base_ms * (self.factor ** (attempt - 1)))

class ImmediateRetryPolicy(IRetryPolicy):
    def next_delay_ms(self, attempt: int) -> int:
        return 0
