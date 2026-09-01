import { describe, beforeEach, afterEach, test, expect, vi } from 'vitest';
import { VisionCaptureAdapter } from '../src/platform/vision/vision_capture_adapter';

describe('VisionCaptureAdapter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  test('enabled=false by default - starts no timers', async () => {
    const adapter = new VisionCaptureAdapter();
    let emitted = 0;
    adapter.onEvent(() => emitted++);

    await adapter.start();
    vi.advanceTimersByTime(5000);
    
    expect(emitted).toBe(0);
    
    await adapter.dispose();
  });

  test('enabled=true with maxFrames bounds capture and stops timer', async () => {
    const adapter = new VisionCaptureAdapter({ enabled: true, captureRate: 10, maxFrames: 5 });
    let emitted = 0;
    adapter.onEvent(() => emitted++);

    await adapter.start();
    
    // 10 fps means 1 frame every 100ms. Wait 1000ms.
    vi.advanceTimersByTime(1000);
    
    // It should have stopped exactly at 5
    expect(emitted).toBe(5);
    
    // Further time shouldn't emit
    vi.advanceTimersByTime(1000);
    expect(emitted).toBe(5);

    await adapter.dispose();
  });

  test('dispose clears timer', async () => {
    const adapter = new VisionCaptureAdapter({ enabled: true, captureRate: 10 });
    let emitted = 0;
    adapter.onEvent(() => emitted++);

    await adapter.start();
    vi.advanceTimersByTime(250); // emits 2
    
    await adapter.dispose();
    
    vi.advanceTimersByTime(1000); // no more emissions
    expect(emitted).toBe(2);
  });
});
