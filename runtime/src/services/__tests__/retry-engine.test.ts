import { describe, it, expect, vi } from 'vitest';
import { RetryEngine } from '../retry-engine';
import { ExecutionError } from '../../errors';

describe('RetryEngine', () => {
  it('should return result if action succeeds immediately', async () => {
    const engine = new RetryEngine();
    const action = vi.fn().mockResolvedValue('success');
    
    const result = await engine.execute(action, { maxAttempts: 3, delayMs: 10 });
    
    expect(result).toBe('success');
    expect(action).toHaveBeenCalledTimes(1);
  });

  it('should retry on failure and succeed if attempt < maxAttempts', async () => {
    const engine = new RetryEngine();
    let count = 0;
    const action = vi.fn().mockImplementation(async () => {
      count++;
      if (count < 3) throw new Error('fail');
      return 'success';
    });
    
    const result = await engine.execute(action, { maxAttempts: 3, delayMs: 10 });
    
    expect(result).toBe('success');
    expect(action).toHaveBeenCalledTimes(3);
  });

  it('should throw ExecutionError if maxAttempts is reached', async () => {
    const engine = new RetryEngine();
    const action = vi.fn().mockRejectedValue(new Error('fail'));
    
    await expect(engine.execute(action, { maxAttempts: 3, delayMs: 10 })).rejects.toThrow(ExecutionError);
    expect(action).toHaveBeenCalledTimes(3);
  });
});
