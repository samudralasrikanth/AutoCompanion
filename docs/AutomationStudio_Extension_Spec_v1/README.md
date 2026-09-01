# VS Code Extension Specification

## 1. Overview
The VS Code extension is the presentation and orchestration layer. It manages commands, views, services, webviews, settings, and communication with the Python framework.

## 2. Folder Structure
apps/studio/src/{extension.ts,commands/,services/,providers/,webviews/,events/,models/,utils/,di/,configuration/}

## 3. Activation Lifecycle
activate() loads configuration, builds the DI container, registers commands, tree views, webviews, event bus and restores workspace state.

## 4. Dependency Injection
All services are registered through a container. Consumers depend on interfaces rather than implementations.

## 5. Services
ProjectService, RecorderService, InspectorService, RunnerService, ReportService, AIService, SecretService, WorkspaceService.

## 6. Commands
Create Project, Open Project, Record, Stop Recording, Generate Code, Run, Debug, Upload Report, Open Object Repository.

## 7. Tree Views
Projects, Scenarios, Object Repository, Reports, Execution History, AI Tasks.

## 8. Webviews
Home Dashboard, Recorder, Inspector, AI Assistant, Report Viewer. Webviews communicate only through typed message contracts.

## 9. IPC
Messages include id, type, version, correlationId, payload and timestamp. All responses are asynchronous.

## 10. State Management
WorkspaceState stores project UI state. GlobalState stores user preferences. SecretStorage stores credentials.

## 11. Error Handling
Central error service maps framework exceptions to user-friendly notifications while preserving structured logs.

## 12. Testing
Extension tests validate activation, commands, views, IPC, and integration with mock framework services.

## 13. Performance
Lazy load heavy services, cache metadata, avoid blocking activation, and batch filesystem updates.

## 14. Security
No secrets in logs. Validate webview messages. Sanitize file paths. Use CSP for webviews.

## 15. Future
Plugin marketplace, cloud execution, collaborative editing, remote agents.