/**
 * Serial async task queue with configurable concurrency.
 */

export class AsyncQueue {
  private readonly queue: Array<() => Promise<void>> = [];
  private running = 0;
  private readonly concurrency: number;

  constructor(concurrency = 1) {
    this.concurrency = Math.max(1, concurrency);
  }

  public enqueue<T>(task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const wrappedTask = async (): Promise<void> => {
        try {
          const result = await task();
          resolve(result);
        } catch (error) {
          reject(error);
        } finally {
          this.running--;
          this.processNext();
        }
      };

      this.queue.push(wrappedTask);
      this.processNext();
    });
  }

  public get pending(): number {
    return this.queue.length;
  }

  public get active(): number {
    return this.running;
  }

  public get isEmpty(): boolean {
    return this.queue.length === 0 && this.running === 0;
  }

  public clear(): void {
    this.queue.length = 0;
  }

  public async drain(): Promise<void> {
    if (this.isEmpty) {
      return;
    }

    return new Promise<void>((resolve) => {
      const check = (): void => {
        if (this.isEmpty) {
          resolve();
        } else {
          setTimeout(check, 10);
        }
      };
      check();
    });
  }

  private processNext(): void {
    while (this.running < this.concurrency && this.queue.length > 0) {
      const task = this.queue.shift();
      if (task) {
        this.running++;
        void task();
      }
    }
  }
}
