# ADR-003: Plugin Development Guidelines

## Status
**Status:** Approved / Active
**Date:** July 2026

## Context
With the core IDE and Runtime decoupled, all new automation capabilities (Inspectors, Recorders, Execution Frameworks, AI tools) must be implemented as Plugins. This document defines the standard template and rules for every official and third-party plugin built for Automation Studio.

## 1. Plugin Folder Structure
Plugins are independent packages. They should follow this structure:
```
packages/plugin-[name]/
├── package.json
├── plugin.json (Plugin Manifest)
├── src/
│   ├── index.ts (Must export default class extending BaseFramework)
│   ├── executor/
│   ├── recorder/
│   ├── inspector/
│   └── tests/
```

## 2. Manifest Schema (`plugin.json`)
Every plugin must define its identity, engine compatibility, dependencies, and capabilities.
```json
{
  "id": "playwright",
  "name": "Playwright Engine",
  "version": "1.0.0",
  "engine": ">=0.2.0",
  "dependencies": {},
  "capabilities": ["executor", "recorder", "inspector"]
}
```

## 3. Lifecycle & Error Handling
Plugins must implement `BaseFramework` and handle lifecycle hooks gracefully:
- `initialize(context: IPluginContext)`: Setup logging, register capabilities.
- `dispose()`: Clean up memory, sockets, and browser instances.
- **Error Handling**: Plugins must NEVER swallow errors natively. Throw typed errors (e.g., `PluginError`) and let the PluginSandbox intercept and format them for the IDE.

## 4. Logging & Event Publishing
Plugins must not use `console.log`. Instead, use the injected context logger and Event Bus:
```typescript
context.logger.info("Playwright browser launched");
context.eventBus.publish({ type: "ELEMENT_IDENTIFIED", payload: { locator: "..." } });
```

## 5. UI Extension Points
If a plugin requires UI, it must register a Webview via the Extension points provided in `apps/studio` (e.g. `CommandRegistry.registerWebview`). Plugins should output platform-agnostic React components or standard HTML/JS bundles that the IDE loads into VS Code Webviews.

## 6. Testing Requirements
- **Unit Tests**: Minimum 80% coverage on capability resolution.
- **E2E Tests**: Mock the `IPluginContext` to ensure the plugin doesn't depend on the VS Code host.

## 7. Version Compatibility & Performance Limits
- **Engine Version**: Must explicitly declare the oldest compatible engine.
- **Performance**: Plugins must not block the Node.js event loop for > 50ms synchronously. Heavy tasks (e.g., OCR processing) must use Worker threads. Memory footprint should remain < 50MB idle.
