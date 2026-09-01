import { describe, expect, it } from 'vitest';
import { AIAgentService } from '../agents/ai-agent-service';

describe('AIAgentService', () => {
  const service = new AIAgentService();

  describe('Requirements to Tests', () => {
    it('splits requirements into multiple blocks based on numbering', () => {
      // Access private method for testing purposes
      const splitFn = (service as any).splitRequirementBlocks.bind(service);
      const reqs = `1. Login to the application.\n2. Navigate to dashboard.\n3. Verify items.`;
      const blocks = splitFn(reqs);
      expect(blocks.length).toBe(3);
      expect(blocks[0]).toContain('Login to the application');
      expect(blocks[2]).toContain('Verify items');
    });

    it('identifies scenario boundaries with headers', () => {
      const splitFn = (service as any).splitRequirementBlocks.bind(service);
      const reqs = `Scenario: User login\nGiven a user\n\nScenario: User logout\nGiven a logged in user`;
      const blocks = splitFn(reqs);
      expect(blocks.length).toBe(2);
      expect(blocks[1]).toContain('User logout');
    });
  });

  describe('Root Cause Analysis', () => {
    it('classifies locator_stale correctly with explicit error code', () => {
      const classify = (service as any).classifyRootCause.bind(service);
      expect(classify('Some random text', 'PW_LOCATOR_TIMEOUT')).toBe('locator_stale');
    });

    it('classifies locator_stale correctly with regex fallback', () => {
      const classify = (service as any).classifyRootCause.bind(service);
      expect(classify('locator resolved to 0 elements', undefined)).toBe('locator_stale');
      expect(classify('Strict mode violation', undefined)).toBe('locator_stale');
    });

    it('classifies timing issues correctly', () => {
      const classify = (service as any).classifyRootCause.bind(service);
      expect(classify('Navigation timeout of 30000ms exceeded', undefined)).toBe('timing');
    });
  });
});
