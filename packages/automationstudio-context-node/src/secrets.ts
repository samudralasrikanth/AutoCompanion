export class SecretManager {
  private secrets = new Map<string, string>();

  public getSecret(key: string): string | undefined {
    return this.secrets.get(key);
  }

  public setSecret(key: string, value: string): void {
    this.secrets.set(key, value);
  }

  public mask(input: string): string {
    let masked = input;
    for (const secret of this.secrets.values()) {
      if (secret && secret.length > 0) {
        // Simple string replacement for demonstration.
        // In reality, this needs a global regex escape replacement.
        masked = masked.split(secret).join('********');
      }
    }
    return masked;
  }
}
