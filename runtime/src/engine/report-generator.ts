import * as path from 'path';
import * as fs from 'fs';
import type { IEventBus, ILogger, IEvent } from '@automation-studio/types';
import { ExecutionEvents, ExecutionCompletedPayload, ExecutionFailedPayload, ExecutionProgressPayload } from '@automation-studio/events';

export class ReportGenerator {
  private readonly executionSteps = new Map<string, string[]>();

  constructor(
    private readonly eventBus: IEventBus,
    private readonly logger: ILogger,
    private readonly workspaceRoot: string | (() => string)
  ) {
    this.setupListeners();
  }

  private getOutputRoot(): string {
    return typeof this.workspaceRoot === 'function' ? this.workspaceRoot() : this.workspaceRoot;
  }

  private setupListeners(): void {
    this.eventBus.subscribe(ExecutionEvents.ExecutionProgress, (event: IEvent<ExecutionProgressPayload>) => {
      const { executionId, step } = event.payload;
      const steps = this.executionSteps.get(executionId) ?? [];
      steps.push(step);
      this.executionSteps.set(executionId, steps);
    });

    this.eventBus.subscribe(ExecutionEvents.ExecutionCompleted, (event: IEvent<ExecutionCompletedPayload>) => {
      this.generateReports(event.payload.executionId, event.payload.duration, 'passed');
    });

    this.eventBus.subscribe(ExecutionEvents.ExecutionFailed, (event: IEvent<ExecutionFailedPayload>) => {
      this.generateReports(event.payload.executionId, event.payload.duration, 'failed', event.payload.error);
    });
  }

  private generateReports(executionId: string, duration: number, status: string, errorMessage?: string): void {
    try {
      const reportsDir = path.join(this.getOutputRoot(), '.automationstudio', 'reports', executionId);
      if (!fs.existsSync(reportsDir)) {
        fs.mkdirSync(reportsDir, { recursive: true });
      }

      // Generate JSON Report
      const steps = this.executionSteps.get(executionId) || [];
      const jsonReport = {
        executionId,
        status,
        duration,
        timestamp: new Date().toISOString(),
        error: errorMessage,
        steps: steps.map((s) => ({ name: s, durationMs: 0, status: 'passed' }))
      };
      this.executionSteps.delete(executionId);
      fs.writeFileSync(path.join(reportsDir, 'report.json'), JSON.stringify(jsonReport, null, 2));

      // Generate JUnit XML Report
      const durationSecs = (duration / 1000).toFixed(3);
      const errorsXml = errorMessage ? `\n      <failure message="Scenario failed"><![CDATA[${errorMessage}]]></failure>` : '';
      const tests = 1;
      const failures = status === 'failed' ? 1 : 0;
      
      const junitXml = `<?xml version="1.0" encoding="UTF-8"?>
<testsuites>
  <testsuite name="Automation Studio Execution" tests="${tests}" failures="${failures}" errors="0" time="${durationSecs}">
    <testcase name="Scenario Execution" classname="AutomationScenario" time="${durationSecs}">${errorsXml}
    </testcase>
  </testsuite>
</testsuites>`;

      fs.writeFileSync(path.join(reportsDir, 'junit.xml'), junitXml);

      this.logger.info(`Generated reports for execution ${executionId} at ${reportsDir}`);
    } catch (error) {
      this.logger.error(`Failed to generate reports: ${(error as Error).message}`);
    }
  }
}
