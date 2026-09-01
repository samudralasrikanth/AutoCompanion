# ADR-001: Platform Core Architecture

**Status**: Accepted  
**Date**: 2024-01-01  
**Authors**: Architecture Team

## Context

Automation Studio needs a robust platform core that every future subsystem (Recorder, Inspector, AI, Execution Engine, Reports, and technology adapters) will depend on. The platform must support enterprise-scale usage, multiple technology adapters, and a plugin ecosystem.

## Decisions

### 1. Clean Architecture with Layered Boundaries

**Decision**: Adopt Clean Architecture with strict dependency direction: UI → Commands → Services → Domain → Infrastructure → VS Code API.

**Rationale**: This ensures the domain logic (project management, automation capabilities) remains testable and portable. VS Code API is an implementation detail, not a core dependency.

### 2. DI Container without Decorator Metadata

**Decision**: Implement a custom DI container using explicit factory registration rather than TypeScript decorator metadata.

**Rationale**: 
- Avoids `reflect-metadata` dependency
- Works with esbuild tree-shaking
- No `experimentalDecorators` requirement
- Explicit dependencies are more readable and debuggable

### 3. Strongly-Typed Event Bus with Replay

**Decision**: Implement an in-process event bus with typed events, correlation IDs, handler error isolation, and configurable history replay.

**Rationale**: Decouples services without introducing external dependencies. Correlation IDs enable distributed tracing across service boundaries. Error isolation prevents one faulty handler from breaking the event chain.

### 4. Capability-Based Automation

**Decision**: Technology adapters expose capabilities through `IAutomationCapability` rather than technology-specific interfaces.

**Rationale**: The execution engine, recorder, and inspector can remain technology-agnostic. Adding SAP, Appium, or Java Swing becomes a matter of registering new capabilities — no changes to the core platform.

### 5. Split Project Manifests

**Decision**: Split project configuration into separate files: `project.json`, `workspace.json`, `settings.json`, `environments.json`, `plugins.json`, `reports.json`.

**Rationale**: 
- Reduces git merge conflicts
- Enables different tools to manage different aspects
- Keeps each file focused and readable
- `workspace.json` is user-specific (gitignored)

### 6. pnpm Monorepo with Workspace Packages

**Decision**: Use pnpm workspaces with separate packages for types, shared utilities, events, and logger.

**Rationale**: Enforces clean module boundaries. Shared packages can be consumed by future apps (CLI, framework host) without duplicating code.

### 7. Structured JSON Logging with Secret Redaction

**Decision**: All logging is structured JSON with automatic secret pattern redaction.

**Rationale**: Enterprise environments require parseable logs for monitoring systems. Redaction prevents accidental secret exposure in log aggregators.

## Consequences

- All services must implement `IService` (initialize, dispose, health, version)
- All errors must extend `AutomationStudioError` with structured codes
- No barrel `index.ts` files in initial implementation to prevent circular imports
- File size cap of 500 lines enforces single-responsibility
