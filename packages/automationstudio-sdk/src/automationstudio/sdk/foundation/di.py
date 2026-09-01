"""
Dependency Injection Container.
Uses a simple singleton/factory registry but allows scoped resolution for execution.
"""
from typing import Type, TypeVar, Dict, Callable, Any

T = TypeVar('T')

class DependencyError(Exception):
    """Raised when a required dependency cannot be resolved."""
    pass

class Container:
    """Enterprise DI container for service resolution."""
    
    def __init__(self):
        self._services: Dict[Type, Any] = {}
        self._factories: Dict[Type, Callable[['Container'], Any]] = {}

    def register_instance(self, interface: Type[T], instance: T) -> None:
        """Register a singleton instance."""
        self._services[interface] = instance

    def register_factory(self, interface: Type[T], factory: Callable[['Container'], T]) -> None:
        """Register a factory that will be called once upon resolution."""
        self._factories[interface] = factory

    def resolve(self, interface: Type[T]) -> T:
        """Resolve a dependency."""
        if interface in self._services:
            return self._services[interface]
            
        if interface in self._factories:
            instance = self._factories[interface](self)
            self._services[interface] = instance 
            return instance
            
        raise DependencyError(f"No registration found for {interface.__name__}")
