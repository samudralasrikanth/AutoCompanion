# Automation Studio

Automation Studio is a visual web and Surface test-automation extension for VS Code. Build a flow in **Automation Studio Builder**, save the generated scenario and Gherkin next to each other, run the ordered steps, and inspect a repeatable HTML report with embedded screenshots.

## What it provides

- Playwright inspection from a URL and a Surface screenshot/capture workflow.
- Flow Builder with ordered steps, generated TypeScript, and readable Gherkin.
- A user-owned workspace at `~/Documents/automationstudio` with visible shared Playwright, Vision, and Python libraries.
- Lean generated projects under `automationstudio/projects/`.
- Project Explorer files, Open/Rename/Delete/Reveal context actions, and report history.
- Repeatable runs producing `report.json`, `junit.xml`, and a self-contained `report.html`.
- Copilot Chat support through `@automationstudio` for Object Repository building, object analysis/correction, and Gherkin hierarchy generation.

## Workspace libraries

The extension creates these readable starter entry points on first activation:

| Library | File | Use |
| --- | --- | --- |
| Playwright | `libraries/playwright/index.ts` | `byRole`, `byTestId`, and `waitForStable` helpers |
| Surface / Vision | `libraries/vision/index.ts` | Control types and screen-analysis contracts |
| Python | `libraries/python/automationstudio_common/screenshot.py` | Screenshot-to-base64 helper |

## Project layout

New projects contain only:

```text
automation/
  scenarios/
  selectors/
  keywords/
data/testdata/
artifacts/screenshots/
.automationstudio/reports/
config/
```

Runtime internals and execution history remain under `.automationstudio/`.

## Usage

1. Install and activate the extension.
2. Run **Automation Studio: Create Project**.
3. Open **Automation Studio Builder** from the Project Explorer.
4. Select PW or Surface, create/save steps, then choose **Run in order**.
5. Open the generated report from the report view or the project’s Reports folder.

## Copilot Chat agents

Use `@automationstudio` in Copilot Chat to:

- **Build Object Repository**: Preview or save a unified Object Repository from the project’s PW and Surface scenarios.
- **Analyze Object**: Analyze an existing `object://...` item and apply manual locator corrections.
- **Generate Gherkin**: Turn test-case text or an attached project file into a readable Gherkin feature hierarchy.
- **Requirements to Tests**: Turn natural language requirements into automated scenarios and Gherkin features.
- **Test Design**: Analyze the project and suggest a test coverage strategy.
- **Root Cause Analysis (RCA)**: Analyze a test failure and suggest a fix.
- **Self-Heal**: Automatically repair broken locators from recent test failures.
- **Release Readiness**: Evaluate test pass rates and flaky tests to determine release readiness.
- **Orchestrate**: Run multiple AI agents in sequence (e.g., heal → rca → readiness).

Agent operations preview changes by default. Saving or updating project files requests confirmation in Chat.

## Requirements

- VS Code 1.85.0+
- Node.js 18+
- Playwright browsers for live PW execution (`npm run install:playwright` in the workspace)
