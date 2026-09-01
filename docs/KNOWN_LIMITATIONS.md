# Known Limitations (v0.2.0 Preview)

As of version `0.2.0`, Automation Studio is in a **Preview** state. The following limitations are known and expected to be addressed in future releases:

1. **Plugin Sandbox**: 
   The current Plugin Engine utilizes a "Logical Sandbox" (Proxy wrappers) rather than true V8 isolates or process boundaries. Misbehaving plugins may still cause memory leaks.

2. **Marketplace UI**:
   The Framework Manager currently queries a mocked internal API. Real VS Code Marketplace or NPM integration for downloading external plugins is not yet implemented.

3. **Execution Engines**:
   While the framework is decoupled, only a rudimentary Python executor is currently wired up. Robust frameworks (Playwright, Selenium) are slated for EPIC-7+.

4. **Recorder / Inspector**:
   The element inspector and recorder are completely absent in this release. Automation scripts must be written by hand.

5. **Performance**:
   Very large `report.json` outputs from high-volume scenarios may cause the HTML Report Viewer Webview to experience slight lag upon rendering.
