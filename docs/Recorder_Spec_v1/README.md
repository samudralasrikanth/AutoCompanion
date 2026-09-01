# Recorder Engine Specification

This package contains the initial implementation specification.

## 1. Purpose
The Recorder Engine captures user interactions and transforms them into a technology-neutral Action Graph before generating maintainable Python automation code. The recorder is designed for developer-first automation rather than low-code workflows.

## 2. Goals
• Record mouse, keyboard and window events.
• Generate reusable Action Graph.
• Produce readable Python.
• Integrate with Object Repository.
• Support Vision, Desktop, Mainframe and Playwright.

## 3. Non-Goals
The recorder is not intended to generate proprietary workflow files or replace manual engineering decisions.

## 4. High Level Architecture
Global Input Hook -> Event Buffer -> Event Normalizer -> Selector Resolver -> Action Graph Builder -> Optimizer -> Python Generator -> VS Code Editor

## 5. Core Components
GlobalHookService
RecorderController
EventNormalizer
ActionGraphBuilder
SelectorResolver
ScreenshotService
CodeGenerator
MetadataWriter

## 6. Recorder State Machine
Idle → Preparing → Recording → Paused → Stopping → Optimizing → CodeGeneration → Completed → Archived

## 7. Action Graph Model
Nodes: Click, DoubleClick, Type, Wait, Verify, Screenshot, OCR, Loop, Condition.
Edges preserve execution order and branching.

## 8. Event Normalization
Merge consecutive keystrokes into TypeText actions.
Collapse duplicate mouse movements.
Insert intelligent waits based on UI idle time.

## 9. Selector Resolution
Priority:
1. Native Automation API
2. Cached Selector
3. Image
4. OCR
5. Anchor
6. Relative Position

## 10. Python Generation
Generate Page Object friendly code with decorators, structured logging, evidence capture and typed helper methods.

## 11. Configuration
record.captureScreenshots
record.smartWait
record.mergeTyping
record.defaultTechnology
record.generateAssertions

## 12. Error Handling
Categorize failures into HookError, SelectorError, OCRFailure, CodeGenerationError. Every error contains correlation id and recovery suggestion.

## 13. Performance Targets
Activation <2s
Capture latency <50ms
Action graph generation <500ms
Python generation <1s for 500 actions

## 14. Testing Strategy
Unit tests for every service.
Golden-file tests for generated Python.
Stress tests for 10,000 recorded events.
Cross-technology integration tests.

## 15. Future Enhancements
Timeline editor
Live AI refactoring
Automatic Page Object extraction
Visual diff
Collaborative recording
