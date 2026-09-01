# Automation Studio

Enterprise Test Automation Platform for VS Code.

## Architecture

```
UI → Commands → Services → Domain → Infrastructure → VS Code API
```

## Monorepo Structure

```
automation-studio/
├── apps/
│   └── studio/          # VS Code Extension
│       └── src/
│           ├── bootstrap/       # Activation & shutdown
│           ├── commands/        # Command registry & descriptors
│           ├── configuration/   # Settings service
│           ├── di/              # Dependency injection container
│           ├── errors/          # Error hierarchy (AS-xxxx)
│           ├── platform/        # Plugin host & capability registry
│           ├── services/
│           │   └── project/     # Project system (EPIC-0002)
│           ├── state/           # Workspace/global/secret state
│           └── extension.ts     # Entry point
├── packages/
│   ├── types/           # TypeScript interfaces (no runtime)
│   ├── shared/          # Utilities (UUID, Disposable, Queue, etc.)
│   ├── events/          # Event bus & event definitions
│   └── logger/          # Structured JSON logger
└── docs/                # Architecture Decision Records, specs & developer guides
    └── ARCHITECTURE_AND_MODIFICATION_GUIDE.md # Comprehensive Developer & Agent Guide
```

## Documentation

For an in-depth breakdown of Flow Builder, Playwright & Surface engines, multi-scenario mechanics, and an exact code modification map, see:
📖 **[Architecture & Developer Modification Guide](file:///Users/srikanthsamudrala/Documents/AutoCon/docs/ARCHITECTURE_AND_MODIFICATION_GUIDE.md)**

Other documentation in `docs/`:
- [Changelog](file:///Users/srikanthsamudrala/Documents/AutoCon/docs/CHANGELOG.md)
- [Roadmap](file:///Users/srikanthsamudrala/Documents/AutoCon/docs/ROADMAP.md)
- [Supported Frameworks](file:///Users/srikanthsamudrala/Documents/AutoCon/docs/SUPPORTED_FRAMEWORKS.md)
- [Contributing Guide](file:///Users/srikanthsamudrala/Documents/AutoCon/docs/CONTRIBUTING.md)
- [Code of Conduct](file:///Users/srikanthsamudrala/Documents/AutoCon/docs/CODE_OF_CONDUCT.md)
- [Security Policy](file:///Users/srikanthsamudrala/Documents/AutoCon/docs/SECURITY.md)
- [Known Limitations](file:///Users/srikanthsamudrala/Documents/AutoCon/docs/KNOWN_LIMITATIONS.md)

## Quick Start

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run tests
pnpm test

# Lint
pnpm lint

# Type check
pnpm typecheck
```

## Key Features

### Dependency Injection
Real DI container with singleton/transient lifecycles, lazy resolution, circular dependency detection, and reverse-order disposal.

### Event Bus
Strongly-typed publish/subscribe with correlation IDs, handler error isolation, and configurable history replay.

### Capability-Based Automation
Technology adapters (Vision, Desktop, Playwright, Mainframe) expose capabilities through a common `IAutomationCapability` interface. The execution engine queries capabilities instead of hardcoding technology checks.

### Project System
Full project lifecycle: create from templates, open, validate, index, migrate, and watch for file changes. Split manifest files reduce merge conflicts.

### Structured Logging
JSON logging with levels (TRACE→FATAL), scoped child loggers, correlation IDs, timing, and automatic secret redaction.

### Error Handling
Structured error hierarchy with codes (AS-xxxx), cause chaining, recovery suggestions, and JSON serialization.

### Secure Secrets Management
Zero-leakage credential management via `secret://` URIs. Secrets are stored in OS-level encrypted vaults (Apple Keychain, Windows Credential Manager, Linux Secret Service) via `vscode.SecretStorage`. Raw passwords and API keys never touch project files, Git commits, or execution logs (backed by automatic redaction).

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Extension | TypeScript 5.x, VS Code Extension API |
| Runtime | Node 22 LTS |
| Build | pnpm, esbuild |
| Quality | ESLint, Prettier, Husky |
| Testing | Vitest |
