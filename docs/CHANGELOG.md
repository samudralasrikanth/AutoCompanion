# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0-preview] - 2026-07-10
### Added
- **Plugin & Marketplace Platform**: The core engine is now fully decoupled from specific execution technologies via the `@automation-studio/registry` and `@automation-studio/sdk`.
- **Framework Manager Webview**: A built-in marketplace for managing plugins and frameworks.
- **Reporting & Console**: Rich HTML reporting, JUnit XML generation, and a custom Output Console panel.
- **Execution Engine**: Support for hierarchical context (Global, Suite, Scenario, Step).

### Changed
- Monolithic VS Code extension split into a robust monorepo (`@automation-studio/*` packages).
- Python execution logic abstracted into a dynamic executor capability.
- Project Scaffolder upgraded to support dependency checks.

## [0.1.0] - 2026-06-25
### Added
- Initial IDE shell, Project scaffolding, and Basic UI layout.
