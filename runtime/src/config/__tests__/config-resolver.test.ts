import { describe, it, expect } from 'vitest';
import { ConfigResolver } from '../config-resolver';

describe('ConfigResolver', () => {
  it('should resolve with base config defaults when no layers are added', () => {
    const resolver = new ConfigResolver();
    const config = resolver.resolve();
    
    expect(config.engine.parallelism).toBe(1);
    expect(config.engine.timeoutMs).toBe(300000);
  });

  it('should merge layers in correct order', () => {
    const resolver = new ConfigResolver();
    
    resolver.addLayer('global', { engine: { parallelism: 2, continueOnFailure: false, timeoutMs: 1000 } });
    resolver.addLayer('workspace', { engine: { parallelism: 4, continueOnFailure: true, timeoutMs: 2000 } });
    resolver.addLayer('project', { engine: { parallelism: 8, continueOnFailure: true, timeoutMs: 3000 } });
    
    const config = resolver.resolve();
    
    // Project > Workspace > Global
    expect(config.engine.parallelism).toBe(8);
    expect(config.engine.continueOnFailure).toBe(true);
    expect(config.engine.timeoutMs).toBe(3000);
  });
});
