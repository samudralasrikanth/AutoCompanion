# Automation Studio (AutoCon) — Architecture & Developer Modification Guide

This document is a comprehensive developer reference designed for any engineer or AI agent working on **Automation Studio (AutoCon)**. It explains the monorepo architecture, core data flows, dual-mode execution engines (Playwright & Surface), multi-scenario mechanisms, and gives an exact **"Where to Make Changes"** code modification map.

---

## 1. Executive Summary & Monorepo Map

Automation Studio is an enterprise-grade VS Code extension and automation framework that bridges **Low-Code Visual Flow Design** with **High-Code Test Automation** for both **Web (Playwright)** and **Desktop / Vision (Surface OCR)**.

```
AutoCon/
├── apps/
│   └── automationstudio/            # VS Code Extension Core
│       ├── src/
│       │   ├── bootstrap/           # Extension activation, lifecycle, service registration
│       │   ├── commands/            # Command registry & VS Code command handlers
│       │   ├── di/                  # Real Dependency Injection container
│       │   ├── engine/              # Generators (Playwright, Surface, Gherkin), Pipeline & IR
│       │   ├── services/
│       │   │   ├── project/         # Project layout, template generation, project.json
│       │   │   ├── secrets/         # SecretManager (secret:// URIs, VS Code SecretStorage)
│       │   │   ├── testdata/        # TestDataProvider, CSV & Excel data loaders
│       │   │   └── ai/              # Copilot AI integration service
│       │   ├── workbench/
│       │   │   ├── flow-builder-webview.ts  # Visual Flowchart Canvas, Inspector, IPC & Tools
│       │   │   └── html/            # Webview HTML templates & inspectors
│       │   └── __tests__/           # Vitest unit & integration test suites
│       └── scripts/
│           └── stage-runtime-dependencies.mjs # Production runtime packager for VSIX
├── packages/
│   ├── automationstudio-types-node/         # Type contracts: IScenario, IStep, FlowNode, IPC
│   ├── automationstudio-playwright-node/    # Playwright browser manager, launcher, DOM inspector
│   ├── automationstudio-vision-node/        # Desktop window capture, OCR processor, native input
│   ├── automationstudio-inspector-node/     # DOM locator inference, CSS/XPath generators
│   ├── automationstudio-sdk-node/           # Runtime execution engines, Object Repository
│   ├── automationstudio-events-node/        # Pub/Sub event bus with correlation IDs
│   ├── automationstudio-logger-node/        # Structured JSON logger with secret redaction
│   └── automationstudio-shared-node/        # Utilities (AsyncQueue, Retry, Disposables, Throttle)
├── docs/                                    # Architecture Decision Records, specs & docs
└── package.json                             # pnpm workspace root
```

---

## 2. Core Subsystems & Data Flow

### 2.1 Webview IPC Communication Flow
The visual Flow Builder runs inside a VS Code Webview (`apps/automationstudio/src/workbench/flow-builder-webview.ts`). Communication between the webview frontend (HTML/JS) and the extension host (Node.js) is message-driven:

```
┌────────────────────────────────────────────────────────┐
│                   Flow Builder Webview                 │
│  - SVG Flowchart Canvas                                │
│  - Scenario Bar (Multi-scenario tabs)                  │
│  - Properties Inspector                                │
│  - Screen Analyzer Modal                               │
│  - Code Preview Tabs (Playwright TS, Python, Gherkin)  │
└───────────────────────┬────────▲───────────────────────┘
  vscode.postMessage()  │        │ panel.postMessage()
  (e.g. pwNavigate,     │        │ (e.g. pwElements,
   surfaceAnalyze,      │        │  flowStepsImported,
   saveFlow, runFlow)   │        │  surfaceWindowCaptured)
┌───────────────────────▼────────┴───────────────────────┐
│              FlowBuilderWebview (Backend)              │
│  - handleMessage() dispatch                            │
│  - Playwright browser lifecycle (Chrome/Edge/Firefox)  │
│  - Desktop window capture (screenshot-desktop)         │
│  - OCR Surface Analysis (tesseract.js + tessdata)      │
│  - CSV Import/Export & Controls correlation            │
│  - Unified Object Repository & SecretManager           │
└────────────────────────────────────────────────────────┘
```

---

## 3. Dual-Mode Architecture

Automation Studio supports two distinct execution paradigms switchable in real time:

### 3.1 Playwright (`pw`) Mode — Web Automation
* **Browser Selector**: Allows users to choose between **Google Chrome** (`channel: 'chrome'`), **Microsoft Edge** (`channel: 'msedge'`), **Chromium**, **Firefox**, or **WebKit**.
* **Interactive Navigation & Inspection**:
  * `ensurePlaywrightPage(url, browserType)`: Launches or attaches to the selected browser.
  * `inspectPlaywright(url)`: Extracts interactive DOM elements (`<button>`, `<input>`, `<a>`, `[role]`, etc.), computes bounding boxes, and generates robust CSS/text locators.
  * `highlightPlaywright(locator)`: Injects an amber bounding box and label overlay in the live browser page.
* **Code Generation**: Emits Playwright `@playwright/test` code including `test.use({ channel: 'chrome' })` (or Edge/Firefox/WebKit) and scenario test suites.

### 3.2 Surface (`surface`) Mode — Desktop & Vision Automation
* **Window Capture**: Uses `screenshot-desktop` to capture active desktop windows or user-uploaded screenshots.
* **OCR & Control Analysis**:
  * Uses `tesseract.js` with local `eng.traineddata` (multi-path resolution across dev workspaces and packaged VSIX extensions).
  * Automatically classifies controls into `button`, `textBox`, `checkBox`, `label`, and creates `WindowName.ControlName` identifiers.
* **Screen Analyzer**:
  * An interactive modal allowing users to zoom, drag-select sub-regions, view detected OCR bounding boxes, and generate sequential test steps.
* **Controls CSV Repository**:
  * Exports/imports `controls.csv` (`window,control,fullName,type,strategy,locator,x,y,width,height`).
* **Python Surface SDK Codegen**: Emits Python test scripts targeting `automationstudio.sdk.surface.run_surface_workflow`.

---

## 4. Multi-Scenario & Data Outline Engine

Flow Builder supports multiple scenarios per feature file and data-driven testing:

1. **Scenario Tabs**:
   * Stored in the webview state as `scenarios = [{ id, name, isOutline, examples, nodes }]`.
   * The active scenario's nodes are bound to the canvas; switching tabs switches canvas context and redraws nodes.
2. **Data Outline (Examples Matrix)**:
   * Any scenario can be toggled into a **Scenario Outline**.
   * An editable **Examples Table** allows adding/removing columns and data rows.
   * **Gherkin Codegen**: Generates `Scenario Outline:` with an `Examples:` markdown table.
   * **Playwright Codegen**: Generates parameterized loop execution over the `examples` array.
3. **CSV Multi-Scenario Import**:
   * CSV files containing a `scenario` column automatically parse and partition rows into separate scenario tabs.

---

## 5. Developer Modification Map (Where to Change What)

When extending or modifying features, use the following guide:

### A. Adding a New Flow Action Type (e.g. `dragAndDrop`, `apiCall`, `dbQuery`)
1. **Define Action Metadata & Palette**:
   * File: [`apps/automationstudio/src/workbench/flow-builder-webview.ts`](file:///Users/srikanthsamudrala/Documents/AutoCon/apps/automationstudio/src/workbench/flow-builder-webview.ts)
   * Add entry to `pwActions` or `surfaceActions` array (`{ type, label, detail, icon, color }`).
2. **Update Properties Inspector**:
   * File: `flow-builder-webview.ts` -> function `renderInspector()`.
   * Add input fields for the new action's target, value, timeout, or options.
3. **Update Code Generation**:
   * File: `flow-builder-webview.ts` -> function `emitPwStep()` (for TypeScript) and Python workflow loop (for Surface).
   * File: `apps/automationstudio/src/engine/generators/` if updating external code generators.
4. **Update Gherkin Translation**:
   * File: `flow-builder-webview.ts` -> function `generateGherkin()`.
5. **Update Live Execution Preview**:
   * File: `flow-builder-webview.ts` -> function `executePlaywright()` or `executeSurface()`.

### B. Modifying Playwright Browser Engines or Launch Options
1. **Browser Options & Detection**:
   * File: [`packages/automationstudio-playwright-node/src/browser-launcher.ts`](file:///Users/srikanthsamudrala/Documents/AutoCon/packages/automationstudio-playwright-node/src/browser-launcher.ts)
   * Function: `chromiumLaunchOptions()`, `systemBrowserCandidates()`.
2. **Webview Browser Dispatcher**:
   * File: [`apps/automationstudio/src/workbench/flow-builder-webview.ts`](file:///Users/srikanthsamudrala/Documents/AutoCon/apps/automationstudio/src/workbench/flow-builder-webview.ts)
   * Methods: `ensurePlaywrightPage()`, `navigateAndInspect()`, and `handleMessage('pwBrowserSelect')`.
   * Frontend: `renderTools()`, `selectPwBrowser()`, `navigatePw()`.

### C. Modifying Desktop Window Capture, OCR, or Screen Analyzer
1. **OCR Processing & Tessdata Search**:
   * File: [`apps/automationstudio/src/workbench/flow-builder-webview.ts`](file:///Users/srikanthsamudrala/Documents/AutoCon/apps/automationstudio/src/workbench/flow-builder-webview.ts)
   * Methods: `ocrSurface()`, `analyzeSurface()`.
2. **Screen Analyzer Dialog UI**:
   * File: `flow-builder-webview.ts` -> functions `openScreenAnalyzer()`, `renderScreenAnalyzer()`, `positionSurfaceOverlays()`, `beginSelection()`, `moveSelection()`, `endSelection()`.

### D. Modifying CSV Import / Export & Starter Templates
1. **Starter CSV Templates**:
   * File: [`apps/automationstudio/src/services/project/project-layout.ts`](file:///Users/srikanthsamudrala/Documents/AutoCon/apps/automationstudio/src/services/project/project-layout.ts)
   * Templates: `import_template_scenarios.csv`, `import_template_standard.csv`, `import_template_full.csv`, `import_template_steps.csv`.
2. **CSV Parsing & Control Correlation**:
   * File: [`apps/automationstudio/src/workbench/flow-builder-webview.ts`](file:///Users/srikanthsamudrala/Documents/AutoCon/apps/automationstudio/src/workbench/flow-builder-webview.ts)
   * Methods: `parseCsvContent()`, `importCsvSteps()`, `exportControlsCsv()`.

### E. Adding New IPC Commands Between Webview & Backend
1. **Backend Message Handler**:
   * File: `flow-builder-webview.ts` -> `handleMessage(message: any)`.
   * Add a new `case 'myNewCommand': await this.myNewHandler(message); break;`.
2. **Frontend Trigger**:
   * In the `<script>` section of `flow-builder-webview.ts`, invoke `vscode.postMessage({ command: 'myNewCommand', ...payload });`.
3. **Backend-to-Frontend Notification**:
   * In `flow-builder-webview.ts`, call `this.panel?.postMessage({ type: 'myNewEvent', ...data });`.
   * Handle it in `window.addEventListener('message', event => { ... })`.

---

## 6. Testing & Quality Assurance

All core functionality is guarded by comprehensive Vitest test suites.

### Running Unit Tests
```bash
# Run all tests in the extension package
cd apps/automationstudio
npm test

# Run tests across entire monorepo
pnpm test
```

### Key Test Suites:
* `src/__tests__/multi-scenario-generation.test.ts`: Multi-scenario Gherkin, Playwright codegen, Scenario Outlines/Examples, browser channel configuration.
* `src/__tests__/flow-builder-csv-controls.test.ts`: `controls.csv` export/import, stepName headers, multi-scenario CSV partitioning.
* `src/__tests__/surface-generator.test.ts`: Surface OCR step and python workflow generation.
* `src/__tests__/project-system.test.ts`: Project templates, validation, and lifecycle.

---

## 7. Packaging & VSIX Distribution

To package the extension into an installable `.vsix`:

```bash
cd apps/automationstudio
npm run vsix
```

### What `npm run vsix` does:
1. Compiles TypeScript via `esbuild.config.mjs` into `dist/extension.js`.
2. Strips `devDependencies` in a temporary `package.json`.
3. Staged required production runtime native dependencies (`playwright-core`, `tesseract.js`, `screenshot-desktop`, `uiohook-napi`) via `scripts/stage-runtime-dependencies.mjs`.
4. Executes `@vscode/vsce package --no-dependencies`.
5. Restores original `package.json` and cleans up temporary staging.
6. Outputs `automation-studio-<version>.vsix`.

---

## 8. Common Gotchas & Architecture Rules

1. **Playwright Window Lifecycle**: Always verify `this.pwBrowser?.isConnected()` before reusing a browser instance. If a user manually closes the Chromium/Chrome window, the handle becomes stale and must be recreated cleanly via `disposePlaywright()`.
2. **Tessdata File Path Resolution**: Never hardcode a single path for OCR `eng.traineddata`. It can reside in `extensionPath/assets/tessdata`, `extensionPath/eng.traineddata`, `workspaceRoot/assets/tessdata`, or `process.cwd()`. Always use multi-path fallback discovery.
3. **Webview Content Security**: Never use external unverified CDN scripts in the webview. All styles, icons, and logic must be self-contained or securely bundled.
4. **Secret Protocol**: Any parameter starting with `secret://` must be resolved through `SecretManager` and never leaked into plain-text logs or generated code.
