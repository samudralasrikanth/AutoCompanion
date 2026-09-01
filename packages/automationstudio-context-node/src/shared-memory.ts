export class SharedMemory {
  private variables = new Map<string, any>();

  constructor(private readonly parent?: SharedMemory) {}

  public get(key: string): any {
    if (this.variables.has(key)) {
      return this.variables.get(key);
    }
    return this.parent?.get(key);
  }

  public set(key: string, value: any): void {
    this.variables.set(key, value);
  }

  public has(key: string): boolean {
    if (this.variables.has(key)) {
      return true;
    }
    return this.parent?.has(key) ?? false;
  }

  public delete(key: string): boolean {
    return this.variables.delete(key);
  }

  public clear(): void {
    this.variables.clear();
  }
}
