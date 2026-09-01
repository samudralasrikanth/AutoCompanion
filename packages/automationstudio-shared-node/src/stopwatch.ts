/**
 * High-resolution stopwatch using performance.now().
 */

export class Stopwatch {
  private startTime: number | undefined;
  private endTime: number | undefined;
  private readonly laps: Array<{ label: string; elapsed: number }> = [];

  public start(): Stopwatch {
    this.startTime = performance.now();
    this.endTime = undefined;
    this.laps.length = 0;
    return this;
  }

  public stop(): number {
    if (this.startTime === undefined) {
      throw new Error('Stopwatch has not been started');
    }
    this.endTime = performance.now();
    return this.elapsed;
  }

  public lap(label: string): number {
    if (this.startTime === undefined) {
      throw new Error('Stopwatch has not been started');
    }
    const elapsed = performance.now() - this.startTime;
    this.laps.push({ label, elapsed });
    return elapsed;
  }

  public get elapsed(): number {
    if (this.startTime === undefined) {
      return 0;
    }
    const end = this.endTime ?? performance.now();
    return end - this.startTime;
  }

  public get isRunning(): boolean {
    return this.startTime !== undefined && this.endTime === undefined;
  }

  public get lapTimes(): ReadonlyArray<{ label: string; elapsed: number }> {
    return [...this.laps];
  }

  public reset(): void {
    this.startTime = undefined;
    this.endTime = undefined;
    this.laps.length = 0;
  }

  public static measure<T>(fn: () => T): { result: T; elapsed: number } {
    const start = performance.now();
    const result = fn();
    const elapsed = performance.now() - start;
    return { result, elapsed };
  }

  public static async measureAsync<T>(fn: () => Promise<T>): Promise<{ result: T; elapsed: number }> {
    const start = performance.now();
    const result = await fn();
    const elapsed = performance.now() - start;
    return { result, elapsed };
  }
}
