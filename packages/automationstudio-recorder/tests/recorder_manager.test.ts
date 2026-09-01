import { describe, beforeEach, test, expect, vi } from 'vitest';
import { RecorderManager } from '../src/recorder/recorder_manager';
import { RecorderState } from '../src/recorder/recorder_state';
import { RecorderAdapterRegistry } from '../src/platform/recorder_adapter_registry';
import { EventQueue } from '../src/events/event_queue';
import { EventSequencer } from '../src/events/event_sequencer';
import { EventCorrelator } from '../src/events/event_correlation';
import { EventNormalizer } from '../src/events/event_normalizer';
import { PlatformRecorderAdapter } from '../src/platform/platform_recorder_adapter';

describe('RecorderManager Lifecycle Transitions', () => {
  let recorder: RecorderManager;
  let mockRegistry: any;
  let mockQueue: any;
  let mockSequencer: any;
  let mockCorrelator: any;
  let mockNormalizer: any;
  let mockAdapter: any;

  beforeEach(() => {
    mockAdapter = {
      contract: { id: 'browser-1', kind: 'recorder', source: 'browser', priority: 1, supportedEventSources: [], supportedEventTypes: [], supportedPlatforms: [], capabilities: [] },
      initialize: vi.fn().mockResolvedValue(undefined),
      onEvent: vi.fn(),
      start: vi.fn().mockResolvedValue(undefined),
      pause: vi.fn().mockResolvedValue(undefined),
      resume: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn().mockResolvedValue(undefined),
      dispose: vi.fn().mockResolvedValue(undefined)
    } as any;

    mockRegistry = {
      resolve: vi.fn().mockReturnValue(mockAdapter),
      register: vi.fn(),
      get: vi.fn(),
      getAll: vi.fn()
    } as any;

    mockQueue = {
      setProcessor: vi.fn(),
      enqueue: vi.fn()
    } as any;

    mockSequencer = {
      sequence: vi.fn(),
      reset: vi.fn()
    } as any;

    mockCorrelator = {
      correlate: vi.fn(),
      updateContext: vi.fn()
    } as any;

    mockNormalizer = {
      process: vi.fn()
    } as any;

    recorder = new RecorderManager(
      mockRegistry,
      mockQueue,
      mockSequencer,
      mockCorrelator,
      mockNormalizer
    );
  });

  test('should start recording successfully', async () => {
    const session = await recorder.start({
      executionId: 'exec-1',
      projectId: 'proj-1',
      testId: 'test-1',
      source: 'browser'
    });

    expect(session.sessionId).toBeDefined();
    expect(session.state).toBe(RecorderState.RECORDING);
    expect(session.source).toBe('browser');
  });

  test('should pause and resume recording', async () => {
    const session = await recorder.start({
      executionId: 'exec-1',
      projectId: 'proj-1',
      testId: 'test-1',
      source: 'browser'
    });

    await recorder.pause(session.sessionId);
    expect(session.state).toBe(RecorderState.PAUSED);

    await recorder.resume(session.sessionId);
    expect(session.state).toBe(RecorderState.RECORDING);
  });

  test('should stop recording and transition to COMPLETED', async () => {
    const session = await recorder.start({
      executionId: 'exec-1',
      projectId: 'proj-1',
      testId: 'test-1',
      source: 'browser'
    });

    const result = await recorder.stop(session.sessionId);
    expect(result.session.state).toBe(RecorderState.COMPLETED);
    expect(result.session.stoppedAt).toBeDefined();
  });

  test('should reject pause when not recording', async () => {
    const session = await recorder.start({
      executionId: 'exec-1',
      projectId: 'proj-1',
      testId: 'test-1',
      source: 'browser'
    });

    await recorder.stop(session.sessionId);
    await expect(recorder.pause(session.sessionId)).rejects.toThrow();
  });

  test('should reject resume when not paused', async () => {
    const session = await recorder.start({
      executionId: 'exec-1',
      projectId: 'proj-1',
      testId: 'test-1',
      source: 'browser'
    });

    await expect(recorder.resume(session.sessionId)).rejects.toThrow();
  });

  test('should support cancellation', async () => {
    const session = await recorder.start({
      executionId: 'exec-1',
      projectId: 'proj-1',
      testId: 'test-1',
      source: 'browser'
    });

    await recorder.cancel(session.sessionId);
    expect(session.state).toBe(RecorderState.CANCELLED);
    expect(session.stoppedAt).toBeDefined();
  });

  test('should support error state recovery', async () => {
    const session = await recorder.start({
      executionId: 'exec-1',
      projectId: 'proj-1',
      testId: 'test-1',
      source: 'browser'
    });

    await recorder.error(session.sessionId, new Error("Something broke"));
    expect(session.state).toBe(RecorderState.ERROR);
    expect(session.metadata.error).toBe("Something broke");
  });
});
