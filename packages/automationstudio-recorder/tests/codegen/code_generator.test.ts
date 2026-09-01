import { describe, beforeEach, test, expect, vi } from 'vitest';
import { CodeGenerator } from '../../src/codegen/code_generator';
import { StructuralTypeScriptEmitter } from '../../src/codegen/emitters/structural_typescript_emitter';
import { CodeGenerationRequest } from '@automation-studio/types';
import * as crypto from 'crypto';

describe('CodeGenerator Gates', () => {
  let generator: CodeGenerator;
  let emitter: StructuralTypeScriptEmitter;

  const sampleRequest: CodeGenerationRequest = {
    schemaVersion: '1.0',
    contractType: 'codegen-request',
    profile: {
      language: 'typescript',
      platform: 'browser',
      framework: 'generic'
    },
    actions: [
      {
        id: 'action-1',
        type: 'click',
        target: { objectId: 'repo-obj-1' },
        metadata: { sourceEventId: 'event-1' }
      },
      {
        id: 'action-2',
        type: 'assert',
        data: { assertionType: 'visible' },
        target: { objectId: 'repo-obj-1' },
        metadata: { sourceEventId: 'event-2' }
      }
    ],
    repository: {
      'repo-obj-1': {
        id: 'repo-obj-1',
        preferredLocatorId: 'loc-1',
        locators: [
          { id: 'loc-1', strategy: 'role', value: 'button' },
          { id: 'loc-2', strategy: 'css', value: '.btn' }
        ]
      }
    }
  };

  beforeEach(() => {
    emitter = new StructuralTypeScriptEmitter();
    generator = new CodeGenerator(emitter);
  });

  test('Gate B - Determinism (1000x generation)', async () => {
    const hashes = new Set<string>();

    for (let i = 0; i < 1000; i++) {
      const result = await generator.generate(sampleRequest);
      const output = JSON.stringify(result);
      const hash = crypto.createHash('sha256').update(output).digest('hex');
      hashes.add(hash);
    }

    expect(hashes.size).toBe(1); // All outputs should produce exactly 1 distinct hash
  });

  test('Gate H - Idempotency', async () => {
    const result1 = await generator.generate(sampleRequest);
    const result2 = await generator.generate(sampleRequest);
    expect(result1).toEqual(result2);
  });

  test('Gate C - Locator Preservation', async () => {
    const result = await generator.generate(sampleRequest);
    expect(result.success).toBe(true);
    const source = result.files[0].content;

    // Check that target locators were forwarded via IR and emitter
    expect(source).toContain('target: button'); 
  });

  test('Gate D - Unsupported Action', async () => {
    const invalidRequest = {
      ...sampleRequest,
      actions: [
        { id: 'action-bad', type: 'teleport' } // Unsupported action type
      ]
    };

    const result = await generator.generate(invalidRequest as any);
    expect(result.success).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'ERROR',
          message: expect.stringContaining('Unknown or unsupported action type: teleport')
        })
      ])
    );
  });

  test('Gate D - Unsupported Emitter Capability', async () => {
    // Force the emitter to not support CLICK
    vi.spyOn(emitter.capabilities.supportedOperations, 'has').mockReturnValue(false);

    const result = await generator.generate(sampleRequest);
    expect(result.success).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'GEN005',
          severity: 'ERROR',
          message: expect.stringContaining('Emitter does not support operation: CLICK')
        })
      ])
    );
  });

  test('Gate G - Traceability', async () => {
    const result = await generator.generate(sampleRequest);
    // While diagnostics don't always carry it unless there's an error, 
    // the IR internally holds it. Let's trigger a capability error to see the traceability.
    vi.spyOn(emitter.capabilities.supportedOperations, 'has').mockImplementation(op => op !== 'CLICK');

    const resultErr = await generator.generate(sampleRequest);
    const diag = resultErr.diagnostics.find(d => d.code === 'GEN005' && d.message.includes('CLICK'));
    
    expect(diag).toBeDefined();
    expect(diag?.sourceLocation).toBeDefined();
    expect(diag?.sourceLocation?.actionId).toBe('action-1');
    expect(diag?.sourceLocation?.sourceEventId).toBe('event-1');
    expect(diag?.sourceLocation?.repositoryObjectId).toBe('repo-obj-1');
  });
});
