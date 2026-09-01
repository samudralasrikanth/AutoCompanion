# Contributing to Automation Studio

Thank you for your interest in contributing to Automation Studio! As an open platform, we rely on the community to build out the framework ecosystem.

## Development Setup

1. **Prerequisites**: Ensure you have Node.js (v20+) and `pnpm` installed.
2. **Install**: Run `pnpm install` at the monorepo root.
3. **Build**: Run `pnpm build` to compile the core packages and extension.
4. **Run**: Open the repository in VS Code and press `F5` to launch the Extension Development Host.

## Architecture

Please read the Architecture Decision Records (ADRs) before submitting structural changes:
- `docs/ADR-001-platform-architecture.md`
- `docs/ADR-002-v0.2-architecture-freeze.md`

## Submitting a Pull Request
1. Fork the repository and create your branch from `main`.
2. Ensure your code passes all linting (`pnpm lint`) and tests (`pnpm test`).
3. Update the documentation and API references if you are modifying the SDK.
4. Issue a PR with a clear description of the problem solved.

## Creating Plugins
If you wish to create a new execution framework or recorder for Automation Studio, please refer to the `@automation-studio/sdk` documentation (coming soon). Plugins should be developed as standalone npm packages that export a class implementing `BaseFramework`.
