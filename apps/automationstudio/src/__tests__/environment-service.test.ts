import { describe, expect, it } from 'vitest';
import { EnvironmentService } from '../workbench/environment-service';

describe('EnvironmentService', () => {
  it('detects packaged JavaScript runtimes instead of reporting placeholders', async () => {
    const logger = {
      info: () => undefined,
      error: () => undefined,
    } as any;
    const eventBus = {} as any;
    const service = new EnvironmentService(logger, eventBus);

    await service.checkAll();

    expect(service.status.node).toBe(true);
    expect(service.status.playwright).toBe(true);
    expect(service.status.ocr).toBe(true);
  });
});
