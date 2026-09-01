# ADR 004: Scenario IR & Build Pipeline Freeze

## Status
Approved

## Context
Over the course of Milestone M1 (Playwright Production Readiness), we have evolved the core architecture of Automation Studio to support an Executable Model paradigm. We introduced an explicit Scenario IR (`IScenario`), a strictly defined Build Pipeline (`Optimize -> Validate -> Lint -> Generate`), and a decoupled deterministic Execution Trace.

With these components successfully supporting the full Playwright authoring workflow, the platform architecture has reached maturity (95-98% complete). To prove that this architecture is truly an "Automation Operating System" agnostic to underlying technologies, we must test it against a completely different domain: Vision/Surface Automation (Computer Vision, OCR, and Raw Input). 

If the core changes continuously during the Vision implementation, we lose the ability to prove the platform's stability.

## Decision
We will formally freeze the core platform components. No breaking changes or structural redesigns may be made to the following components without a formal ADR and explicit architectural consensus:

- `IScenario` and `IStep` interfaces (Scenario IR)
- `ExecutionTrace` and `StepTrace` interfaces
- `IGenerationProfile`
- The `BuildPipeline` lifecycle (Optimize -> Validate -> Lint -> Generate -> Execute)
- `ScenarioOptimizer`
- `ScenarioValidator`
- `ScenarioLinter`
- `ScenarioDiff`
- Incremental Build Cache mechanism
- Plugin SDK interfaces
- Plugin Registry architecture
- Scenario Editor & Inspector integration points

Any future modifications to these components must strictly be driven by concrete limitations discovered while implementing new technology plugins (e.g., Vision), rather than preemptive refactoring.

## Consequences
- **Positive:** A stable core provides a reliable foundation for plugin developers. The transition to Vision automation will serve as an honest test of the platform's extensibility.
- **Negative:** If significant limitations are discovered during the Vision implementation, retrofitting the frozen core will require careful version management and migration strategies.
