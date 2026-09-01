export interface ReportGenerator {
  generate(runId: string): Promise<void>;
}

export class JsonReportGenerator implements ReportGenerator {
  public async generate(runId: string): Promise<void> {
    console.log(`Generating JSON report for ${runId}...`);
  }
}

export class HtmlReportGenerator implements ReportGenerator {
  public async generate(runId: string): Promise<void> {
    console.log(`Generating HTML report for ${runId}...`);
  }
}
