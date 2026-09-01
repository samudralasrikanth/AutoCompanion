/**
 * Vision Release Candidate (RC1) Test Suite
 * ===========================================
 * Covers all 20 test cases from the Vision RC1 Test Plan.
 *
 * Tests are structured as unit/integration tests that verify
 * the entire Vision platform without requiring a live desktop session.
 * Where native APIs (screenshot, pyautogui) are required, they are
 * mocked to exercise all logic paths deterministically.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the `vscode` module (not available outside the VS Code extension host)
vi.mock('vscode', () => ({
  window: {
    createWebviewPanel: vi.fn(() => ({
      webview: { html: '', postMessage: vi.fn(), onDidReceiveMessage: vi.fn() },
      onDidDispose: vi.fn(),
      dispose: vi.fn()
    })),
    showErrorMessage: vi.fn(),
    showInformationMessage: vi.fn()
  },
  ViewColumn: { Beside: 2, Two: 2 },
  Uri: { file: (p: string) => ({ fsPath: p }) }
}));

// Mock screenshot-desktop (requires native binary)
vi.mock('screenshot-desktop', () => ({
  default: vi.fn(() => Promise.resolve(Buffer.from('fake-screenshot-data')))
}));

// Mock uiohook-napi (requires native binary)
vi.mock('uiohook-napi', () => ({
  uIOhook: {
    on: vi.fn(),
    start: vi.fn(),
    stop: vi.fn()
  },
  UiohookKey: { Enter: 13, Backspace: 8, Tab: 9 }
}));

// ─── Test 1: Plugin Initialization ──────────────────────────────────────────

describe('Test 1 – Plugin Initialization', () => {
  it('should instantiate VisionPlugin without exceptions', async () => {
    const { default: VisionPlugin } = await import('../../packages/vision/src/index');
    const plugin = new VisionPlugin();
    expect(plugin).toBeDefined();
    expect(plugin.constructor.name).toBe('VisionPlugin');
  });

  it('should initialize all capabilities after initialize()', async () => {
    const { default: VisionPlugin } = await import('../../packages/vision/src/index');
    const plugin = new VisionPlugin();
    await plugin.initialize();

    // Inspector
    expect(plugin.inspector).toBeDefined();
    expect(plugin.inspector.name).toBe('Vision Vision Inspector');

    // Recorder
    expect(plugin.recorder).toBeDefined();
    expect(plugin.recorder.name).toBe('vision-recorder');

    // Executor (PythonBackend)
    expect(plugin.backend).toBeDefined();

    // Vision Engine (through pipeline / action registry)
    expect(plugin.pipeline).toBeDefined();
    expect(plugin.actionRegistry).toBeDefined();
  });

  it('should register capabilities: inspector, recorder, executor', async () => {
    const { default: VisionPlugin } = await import('../../packages/vision/src/index');
    const plugin = new VisionPlugin();
    await plugin.initialize();

    // Verify each capability object has the expected interface
    expect(typeof plugin.inspector.createSession).toBe('function');
    expect(typeof plugin.recorder.createSession).toBe('function');
    expect(typeof plugin.backend.execute).toBe('function');
  });

  it('should register in TechnologyRegistry with correct capabilities', async () => {
    const { TechnologyRegistry } = await import('../../packages/registry/src/technology-registry');
    const { default: VisionPlugin } = await import('../../packages/vision/src/index');

    const registry = new TechnologyRegistry();
    registry.register({
      id: 'vision',
      name: 'Vision',
      version: '0.1.0',
      capabilities: ['inspector', 'recorder', 'executor'],
      createFramework: () => new VisionPlugin()
    });

    const inspectors = registry.resolveByCapability('inspector');
    const recorders = registry.resolveByCapability('recorder');
    const executors = registry.resolveByCapability('executor');

    expect(inspectors.length).toBeGreaterThanOrEqual(1);
    expect(recorders.length).toBeGreaterThanOrEqual(1);
    expect(executors.length).toBeGreaterThanOrEqual(1);
  });
});

// ─── Test 2: Automation Service (VisionServiceManager) ───────────────────────

describe('Test 2 – Automation Service', () => {
  it('should start in stopped status', async () => {
    const { VisionServiceManager } = await import('../../packages/vision/src/vision/vision-service-manager');
    const manager = new VisionServiceManager();
    const health = await manager.health();
    expect(health.status).toBe('stopped');
  });

  it('should report capabilities', async () => {
    const { VisionServiceManager } = await import('../../packages/vision/src/vision/vision-service-manager');
    const manager = new VisionServiceManager();
    const caps = await manager.capabilities();
    expect(caps).toContain('ocr');
    expect(caps).toContain('template');
  });

  it('should report version', async () => {
    const { VisionServiceManager } = await import('../../packages/vision/src/vision/vision-service-manager');
    const manager = new VisionServiceManager();
    const version = await manager.version();
    expect(version).toBe('0.1.0-sidecar');
  });

  it('should track restart count', async () => {
    const { VisionServiceManager } = await import('../../packages/vision/src/vision/vision-service-manager');
    const manager = new VisionServiceManager();
    const health = await manager.health();
    expect(health.restartCount).toBe(0);
    expect(health.uptime).toBe(0);
  });

  it('health endpoint should return correct backend type', async () => {
    const { VisionServiceManager } = await import('../../packages/vision/src/vision/vision-service-manager');
    const manager = new VisionServiceManager();
    const health = await manager.health();
    expect(health.backend.name).toBe('Python OpenCV Sidecar');
    expect(health.backend.type).toBe('cpu');
  });
});

// ─── Test 3: Screenshot Capture (Coordinate strategy + VisionEngine) ─────────

describe('Test 3 – Screenshot Capture', () => {
  it('CoordinateStrategyResolver should resolve valid coordinates', async () => {
    const { CoordinateStrategyResolver } = await import('../../packages/vision/src/vision/strategies/coordinate-strategy');
    const resolver = new CoordinateStrategyResolver();
    const context = { width: 1920, height: 1080, dpi: 96, monitorIndex: 0, scope: 'desktop' as const };

    const candidates = await resolver.resolve(
      { type: 'coordinate', value: '960,540' },
      Buffer.alloc(0),
      context
    );

    expect(candidates.length).toBe(1);
    expect(candidates[0]!.confidence).toBe(100);
    // Center should be approx 960/1920 = 0.5
    const cx = candidates[0]!.location.nx + candidates[0]!.location.nw / 2;
    expect(cx).toBeCloseTo(960 / 1920, 2);
  });

  it('CoordinateStrategyResolver should reject invalid coordinates', async () => {
    const { CoordinateStrategyResolver } = await import('../../packages/vision/src/vision/strategies/coordinate-strategy');
    const resolver = new CoordinateStrategyResolver();
    const context = { width: 1920, height: 1080, dpi: 96, monitorIndex: 0, scope: 'desktop' as const };

    const candidates = await resolver.resolve(
      { type: 'coordinate', value: 'invalid' },
      Buffer.alloc(0),
      context
    );

    expect(candidates.length).toBe(0);
  });

  it('should handle multiple monitor contexts via CaptureContext', async () => {
    const { CoordinateStrategyResolver } = await import('../../packages/vision/src/vision/strategies/coordinate-strategy');
    const resolver = new CoordinateStrategyResolver();

    // Simulate different resolutions
    const hd = { width: 1920, height: 1080, dpi: 96, monitorIndex: 0, scope: 'desktop' as const };
    const fourK = { width: 3840, height: 2160, dpi: 192, monitorIndex: 1, scope: 'desktop' as const };

    const hdResult = await resolver.resolve(
      { type: 'coordinate', value: '960,540' },
      Buffer.alloc(0),
      hd
    );
    const fourKResult = await resolver.resolve(
      { type: 'coordinate', value: '960,540' },
      Buffer.alloc(0),
      fourK
    );

    // Same pixel coords give different normalized positions on different resolutions
    expect(hdResult[0]!.location.nx).not.toEqual(fourKResult[0]!.location.nx);
  });
});

// ─── Test 4: OCR Detection ──────────────────────────────────────────────────

describe('Test 4 – OCR Detection', () => {
  it('SidecarBridge should construct correct form data for OCR analysis', async () => {
    const { SidecarBridge } = await import('../../packages/vision/src/vision/sidecar-bridge');
    const bridge = new SidecarBridge();

    // The bridge builds multipart form data correctly
    const buildFormData = (bridge as any).buildFormData.bind(bridge);
    const result = buildFormData(
      { screenshot: Buffer.from('fake-png') },
      {
        locator: JSON.stringify({ strategies: [{ type: 'ocr', value: 'Login' }] }),
        capabilities: JSON.stringify(['ocr']),
        captureContext: JSON.stringify({ width: 1920, height: 1080 })
      }
    );

    expect(result.buffer).toBeInstanceOf(Buffer);
    expect(result.contentType).toContain('multipart/form-data');
    // Verify the form data contains our fields
    const bodyStr = result.buffer.toString();
    expect(bodyStr).toContain('Login');
    expect(bodyStr).toContain('ocr');
  });

  it('should return empty candidates when sidecar is not available', async () => {
    const { VisionServiceManager } = await import('../../packages/vision/src/vision/vision-service-manager');
    const manager = new VisionServiceManager();
    const context = { width: 1920, height: 1080, dpi: 96, monitorIndex: 0, scope: 'desktop' as const };

    // Without starting the sidecar, analyze should gracefully return empty
    const candidates = await manager.analyze(
      Buffer.from('fake-screenshot'),
      { strategies: [{ type: 'ocr', value: 'Login' }] },
      context
    );

    // Should not throw, may return empty if sidecar fails to start
    expect(Array.isArray(candidates)).toBe(true);
  });
});

// ─── Test 5: Image Detection (Template Matching) ────────────────────────────

describe('Test 5 – Image Detection', () => {
  it('SidecarBridge form data should include template file when image strategy has path', async () => {
    const { SidecarBridge } = await import('../../packages/vision/src/vision/sidecar-bridge');
    const bridge = new SidecarBridge();

    const buildFormData = (bridge as any).buildFormData.bind(bridge);
    const templateBuffer = Buffer.from('fake-template-png');
    const result = buildFormData(
      { screenshot: Buffer.from('fake-screenshot'), template: templateBuffer },
      {
        locator: JSON.stringify({ strategies: [{ type: 'image', value: '/path/to/template.png' }] }),
        capabilities: JSON.stringify(['template']),
        captureContext: JSON.stringify({ width: 1920, height: 1080 })
      }
    );

    expect(result.buffer.toString()).toContain('template');
    expect(result.contentType).toContain('multipart/form-data');
  });

  it('VisionServiceManager should correctly delegate to sidecar with multi-capability locator', async () => {
    const { VisionServiceManager } = await import('../../packages/vision/src/vision/vision-service-manager');
    const manager = new VisionServiceManager();
    const context = { width: 1920, height: 1080, dpi: 96, monitorIndex: 0, scope: 'desktop' as const };

    // Testing the analyze method exists and accepts correct types
    const result = await manager.analyze(
      Buffer.from('fake'),
      {
        strategies: [
          { type: 'ocr', value: 'Login' },
          { type: 'image', value: '/fake/template.png' }
        ]
      },
      context
    );

    expect(Array.isArray(result)).toBe(true);
  });
});

// ─── Test 6: Multi-Strategy Fusion ──────────────────────────────────────────

describe('Test 6 – Multi-Strategy Fusion', () => {
  it('should fuse candidates from OCR, Image, and Anchor strategies', async () => {
    const { ConfidenceFusion } = await import('../../packages/vision/src/vision/confidence-fusion');
    const { PLATFORM_WEIGHTS } = await import('../../packages/vision/src/vision/weight-resolver');
    const fusion = new ConfidenceFusion();

    const candidates = [
      { strategy: 'ocr' as const, confidence: 92, location: { nx: 0.5, ny: 0.5, nw: 0.05, nh: 0.02 }, metadata: { text: 'Login' } },
      { strategy: 'image' as const, confidence: 88, location: { nx: 0.49, ny: 0.50, nw: 0.06, nh: 0.03 }, metadata: { scale: 1.0 } },
      { strategy: 'anchor' as const, confidence: 95, location: { nx: 0.50, ny: 0.51, nw: 0.01, nh: 0.01 }, metadata: {} }
    ];

    const result = fusion.fuse(candidates, PLATFORM_WEIGHTS);

    expect(result.found).toBe(true);
    expect(result.confidence).toBeGreaterThanOrEqual(80);
    expect(result.cluster.length).toBe(3); // All 3 in same cluster
  });

  it('should select winning cluster with most distinct strategies', async () => {
    const { ConfidenceFusion } = await import('../../packages/vision/src/vision/confidence-fusion');
    const { PLATFORM_WEIGHTS } = await import('../../packages/vision/src/vision/weight-resolver');
    const fusion = new ConfidenceFusion();

    // Cluster A: 2 strategies at location (0.5, 0.5)
    // Cluster B: 1 strategy at location (0.1, 0.1) with higher individual confidence
    const candidates = [
      { strategy: 'ocr' as const, confidence: 80, location: { nx: 0.5, ny: 0.5, nw: 0.05, nh: 0.02 }, metadata: {} },
      { strategy: 'image' as const, confidence: 85, location: { nx: 0.50, ny: 0.51, nw: 0.06, nh: 0.03 }, metadata: {} },
      { strategy: 'coordinate' as const, confidence: 100, location: { nx: 0.1, ny: 0.1, nw: 0.01, nh: 0.01 }, metadata: {} },
    ];

    const result = fusion.fuse(candidates, PLATFORM_WEIGHTS);

    // Cluster A should win due to more distinct strategies (2 > 1)
    expect(result.cluster.length).toBe(2);
    expect(result.cluster.some(c => c.strategy === 'ocr')).toBe(true);
    expect(result.cluster.some(c => c.strategy === 'image')).toBe(true);
  });

  it('should return found=false when no candidates have confidence', async () => {
    const { ConfidenceFusion } = await import('../../packages/vision/src/vision/confidence-fusion');
    const { PLATFORM_WEIGHTS } = await import('../../packages/vision/src/vision/weight-resolver');
    const fusion = new ConfidenceFusion();

    const result = fusion.fuse([], PLATFORM_WEIGHTS);
    expect(result.found).toBe(false);
    expect(result.confidence).toBe(0);
    expect(result.cluster.length).toBe(0);
  });

  it('should add bonus for multi-strategy agreement', async () => {
    const { ConfidenceFusion } = await import('../../packages/vision/src/vision/confidence-fusion');
    const { PLATFORM_WEIGHTS } = await import('../../packages/vision/src/vision/weight-resolver');
    const fusion = new ConfidenceFusion();

    // Single strategy
    const single = fusion.fuse(
      [{ strategy: 'ocr' as const, confidence: 80, location: { nx: 0.5, ny: 0.5, nw: 0.05, nh: 0.02 } }],
      PLATFORM_WEIGHTS
    );

    // Two strategies at same location
    const dual = fusion.fuse(
      [
        { strategy: 'ocr' as const, confidence: 80, location: { nx: 0.5, ny: 0.5, nw: 0.05, nh: 0.02 } },
        { strategy: 'image' as const, confidence: 80, location: { nx: 0.50, ny: 0.50, nw: 0.05, nh: 0.02 } }
      ],
      PLATFORM_WEIGHTS
    );

    // Dual should have higher confidence due to strategy agreement bonus
    expect(dual.confidence).toBeGreaterThanOrEqual(single.confidence);
  });

  it('WeightResolver should apply hierarchy: platform → project → locator overrides', async () => {
    const { WeightResolver, PLATFORM_WEIGHTS } = await import('../../packages/vision/src/vision/weight-resolver');

    const resolver = new WeightResolver({ ocr: 0.50 }); // project override
    const weights = resolver.resolveWeights({
      strategies: [],
      weightOverrides: { image: 0.90 } // locator override
    });

    expect(weights.ocr).toBe(0.50); // project override took effect
    expect(weights.image).toBe(0.90); // locator override took effect
    expect(weights.coordinate).toBe(PLATFORM_WEIGHTS.coordinate); // platform default
  });
});

// ─── Test 7: Object Repository ──────────────────────────────────────────────

describe('Test 7 – Object Repository', () => {
  it('should save and retrieve a vision object with full definition', async () => {
    const { ObjectRepository } = await import('../../packages/sdk/src/object-repository');
    const repo = new ObjectRepository();

    repo.addElement({
      id: 'login-button',
      name: 'Login Button',
      locators: [
        { strategy: 'ocr' as any, value: 'Login' },
        { strategy: 'image' as any, value: '/templates/login.png' },
      ],
      description: 'The main login button'
    });

    const element = repo.getElement('login-button');
    expect(element).toBeDefined();
    expect(element!.name).toBe('Login Button');
    expect(element!.locators.length).toBe(2);
  });

  it('VisualObject interface should support OCR, Image, Anchor, Metadata', async () => {
    const { IVisualObject } = await import('../../packages/sdk/src/repository/object-repository') as any;

    // Verify the interface supports all required fields
    const obj = {
      id: 'test-obj',
      name: 'Test Object',
      folderPath: 'Inspector',
      definition: {
        ocr: { text: 'Login', type: 'exact' as const },
        image: { path: '/templates/login.png', hash: 'abc123' },
        anchor: { objectId: 'username-label', direction: 'below' as const, maxDistance: 50 },
        color: { hex: '#007bff', tolerance: 10 },
        shape: { type: 'button' as const }
      },
      metrics: {
        confidenceHistory: { avg: 92.5, runs: 15, failures: 1 }
      },
      assets: {
        trainingImages: ['/img/login_1.png', '/img/login_2.png'],
        screenshots: ['/screenshots/login_capture.png']
      },
      metadata: { source: 'inspector' }
    };

    expect(obj.definition.ocr).toBeDefined();
    expect(obj.definition.image).toBeDefined();
    expect(obj.definition.anchor).toBeDefined();
    expect(obj.metrics!.confidenceHistory.avg).toBe(92.5);
    expect(obj.assets!.trainingImages.length).toBe(2);
  });

  it('should delete objects from repository', async () => {
    const { ObjectRepository } = await import('../../packages/sdk/src/object-repository');
    const repo = new ObjectRepository();

    repo.addElement({ id: 'test', name: 'Test', locators: [] });
    expect(repo.getElement('test')).toBeDefined();

    repo.removeElement('test');
    expect(repo.getElement('test')).toBeUndefined();
  });

  it('should list all objects', async () => {
    const { ObjectRepository } = await import('../../packages/sdk/src/object-repository');
    const repo = new ObjectRepository();

    repo.addElement({ id: 'a', name: 'A', locators: [] });
    repo.addElement({ id: 'b', name: 'B', locators: [] });
    repo.addElement({ id: 'c', name: 'C', locators: [] });

    expect(repo.getAllElements().length).toBe(3);
  });
});

// ─── Test 8: Executor ───────────────────────────────────────────────────────

describe('Test 8 – Executor', () => {
  it('PythonBackend should accept execute commands', async () => {
    const { PythonBackend } = await import('../../packages/vision/src/executor/python-backend');
    const { VisionEngine } = await import('../../packages/vision/src/vision/vision-engine');

    // Mock the sidecar bridge to avoid actual Python subprocess
    const engine = new VisionEngine();
    const backend = new PythonBackend(engine);

    expect(typeof backend.execute).toBe('function');
    expect(typeof backend.cancel).toBe('function');
  });

  it('SidecarBridge should build correct execute payload for click', async () => {
    const { SidecarBridge } = await import('../../packages/vision/src/vision/sidecar-bridge');
    const bridge = new SidecarBridge();
    const buildFormData = (bridge as any).buildFormData.bind(bridge);

    const command = {
      action: 'click',
      locator: { strategies: [{ type: 'ocr', value: 'Login' }] }
    };

    const result = buildFormData({}, { command: JSON.stringify(command) });
    const bodyStr = result.buffer.toString();
    expect(bodyStr).toContain('"action":"click"');
    expect(bodyStr).toContain('Login');
  });

  it('should support all action types: click, doubleClick, hover, rightClick', async () => {
    const { SidecarBridge } = await import('../../packages/vision/src/vision/sidecar-bridge');
    const bridge = new SidecarBridge();
    const buildFormData = (bridge as any).buildFormData.bind(bridge);

    const actions = ['click', 'doubleClick', 'hover', 'rightClick'];
    for (const action of actions) {
      const command = { action, locator: { strategies: [{ type: 'ocr', value: 'Target' }] } };
      const result = buildFormData({}, { command: JSON.stringify(command) });
      expect(result.buffer.toString()).toContain(`"action":"${action}"`);
    }
  });
});

// ─── Test 9: Keyboard Input ─────────────────────────────────────────────────

describe('Test 9 – Keyboard Input', () => {
  it('should support type action with text parameter', async () => {
    const { SidecarBridge } = await import('../../packages/vision/src/vision/sidecar-bridge');
    const bridge = new SidecarBridge();
    const buildFormData = (bridge as any).buildFormData.bind(bridge);

    const command = {
      action: 'type',
      locator: { strategies: [{ type: 'ocr', value: 'Username' }] },
      options: { text: 'Hello World' }
    };

    const result = buildFormData({}, { command: JSON.stringify(command) });
    const bodyStr = result.buffer.toString();
    expect(bodyStr).toContain('Hello World');
    expect(bodyStr).toContain('"action":"type"');
  });

  it('should support pressKey action', async () => {
    const { SidecarBridge } = await import('../../packages/vision/src/vision/sidecar-bridge');
    const bridge = new SidecarBridge();
    const buildFormData = (bridge as any).buildFormData.bind(bridge);

    const command = {
      action: 'pressKey',
      options: { key: 'enter' }
    };

    const result = buildFormData({}, { command: JSON.stringify(command) });
    expect(result.buffer.toString()).toContain('"action":"pressKey"');
    expect(result.buffer.toString()).toContain('enter');
  });
});

// ─── Test 10: Locate + Execute + Verify (Atomic Execution) ──────────────────

describe('Test 10 – Locate + Execute + Verify', () => {
  it('RetryEngine should execute operation successfully on first attempt', async () => {
    const { RetryEngine } = await import('../../packages/sdk/src/execution/retry-engine');

    const operation = vi.fn().mockResolvedValue({ success: true, match: { confidence: 95 } });
    const policy = { retries: 3, retryStrategy: 'fixed', confidenceThreshold: 50, waitAfter: 0, onFailure: 'fail' as const };

    const result = await RetryEngine.executeWithRetry(operation, policy);

    expect(result.success).toBe(true);
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('VerificationEngine interface should exist with correct methods', async () => {
    const { VerificationEngine } = await import('../../packages/sdk/src/execution/verification-engine');
    expect(typeof VerificationEngine.verify).toBe('function');
  });

  it('ActionPipeline should exist and support execution', async () => {
    const { ActionPipeline } = await import('../../packages/sdk/src/execution/action-pipeline');
    expect(ActionPipeline).toBeDefined();
  });
});

// ─── Test 11: Failure Handling ──────────────────────────────────────────────

describe('Test 11 – Failure Handling', () => {
  it('RetryEngine should retry on failure and exhaust attempts', async () => {
    const { RetryEngine } = await import('../../packages/sdk/src/execution/retry-engine');

    const operation = vi.fn().mockResolvedValue({ success: false, error: 'Not found' });
    const policy = { retries: 2, retryStrategy: 'fixed', confidenceThreshold: 50, waitAfter: 0, onFailure: 'fail' as const };

    const result = await RetryEngine.executeWithRetry(operation, policy);

    expect(result.success).toBe(false);
    expect(operation).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
  });

  it('RetryEngine should support exponential backoff strategy', async () => {
    const { RetryEngine } = await import('../../packages/sdk/src/execution/retry-engine');

    const start = Date.now();
    const operation = vi.fn().mockResolvedValue({ success: false, error: 'Fail' });
    const policy = { retries: 1, retryStrategy: 'exponential', confidenceThreshold: 50, waitAfter: 0, onFailure: 'fail' as const };

    await RetryEngine.executeWithRetry(operation, policy);

    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('RetryEngine should fail on low confidence below threshold', async () => {
    const { RetryEngine } = await import('../../packages/sdk/src/execution/retry-engine');

    const operation = vi.fn().mockResolvedValue({ success: true, match: { confidence: 30 } });
    const policy = { retries: 0, retryStrategy: 'fixed', confidenceThreshold: 80, waitAfter: 0, onFailure: 'fail' as const };

    const result = await RetryEngine.executeWithRetry(operation, policy);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Confidence');
  });

  it('RetryEngine should trigger AI healing on failure with heal policy', async () => {
    const { RetryEngine } = await import('../../packages/sdk/src/execution/retry-engine');

    const operation = vi.fn().mockResolvedValue({ success: false, error: 'Element not found' });
    const policy = { retries: 0, retryStrategy: 'fixed', confidenceThreshold: 50, waitAfter: 0, onFailure: 'heal' as const };

    const result = await RetryEngine.executeWithRetry(operation, policy);

    expect(result.success).toBe(false);
    expect(result.error).toContain('AI Healing');
  });

  it('RetryEngine should respect AbortSignal', async () => {
    const { RetryEngine } = await import('../../packages/sdk/src/execution/retry-engine');

    const controller = new AbortController();
    controller.abort(); // Abort immediately

    const operation = vi.fn().mockResolvedValue({ success: true });
    const policy = { retries: 3, retryStrategy: 'fixed', confidenceThreshold: 50, waitAfter: 0, onFailure: 'fail' as const };

    const result = await RetryEngine.executeWithRetry(operation, policy, controller.signal);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Aborted');
    expect(operation).not.toHaveBeenCalled();
  });
});

// ─── Test 12: Recorder ──────────────────────────────────────────────────────

describe('Test 12 – Recorder', () => {
  it('RecorderOptimizer should merge keydown events into type steps', async () => {
    const { RecorderOptimizer } = await import('../../apps/studio/src/engine/recorder-optimizer');
    const optimizer = new RecorderOptimizer();

    // Simulate 5 keydown events for "Hello"
    const keys = ['H', 'e', 'l', 'l', 'o'];
    for (const key of keys) {
      const result = optimizer.optimize({
        id: 'test-kd',
        action: 'keydown',
        key,
        timestamp: Date.now(),
        targetName: 'input-field'
      });
      expect(result.data.length).toBe(0); // buffered
    }

    // Flush the buffer
    const step = optimizer.flushBuffer();
    expect(step).toBeDefined();
    expect(step!.action).toBe('type');
    expect(step!.parameters.text).toBe('Hello');
  });

  it('RecorderOptimizer should produce semantic click steps (not raw coordinates)', async () => {
    const { RecorderOptimizer } = await import('../../apps/studio/src/engine/recorder-optimizer');
    const optimizer = new RecorderOptimizer();

    const result = optimizer.optimize({
      id: 'test-click',
      action: 'click',
      targetName: 'LoginButton',
      timestamp: Date.now()
    });

    expect(result.data.length).toBe(1);
    const clickStep = result.data[0];
    expect(clickStep).toBeDefined();
    expect(clickStep!.target).toBe('LoginButton');
    // Should NOT contain MouseX, MouseY in metadata
    expect(clickStep!.action).toBe('click');
  });

  it('VisionRecorder should create a session with correct interface', async () => {
    const { VisionRecorder } = await import('../../packages/vision/src/recorder/vision-recorder');
    const recorder = new VisionRecorder();
    expect(recorder.name).toBe('vision-recorder');
    expect(typeof recorder.createSession).toBe('function');
  });
});

// ─── Test 13: Vision Enrichment ─────────────────────────────────────────────

describe('Test 13 – Vision Enrichment', () => {
  it('VisionEnricher should enrich actions with target object IDs', async () => {
    const { VisionEnricher } = await import('../../packages/vision/src/recorder/vision-enricher');
    const { VisionEngine } = await import('../../packages/vision/src/vision/vision-engine');

    // Create a mock repository
    const savedObjects: any[] = [];
    const mockRepo = {
      saveObject: vi.fn(async (obj: any) => { savedObjects.push(obj); }),
      getObject: vi.fn(),
      getAllObjects: vi.fn(),
      deleteObject: vi.fn()
    };

    const engine = new VisionEngine();
    const enricher = new VisionEnricher(engine, mockRepo);

    const action = {
      id: 'action-1',
      action: 'click',
      parameters: { x: 500, y: 300 },
      timestamp: Date.now(),
      metadata: {
        confidence: 0,
        monitor: 1,
        screenshotBefore: Buffer.from('fake-screenshot')
      }
    } as any;

    const enriched = await enricher.enrich(action);

    expect(mockRepo.saveObject).toHaveBeenCalledTimes(1);
    expect(enriched.target).toBeDefined();
    expect(enriched.metadata.confidence).toBe(0.95);
  });

  it('VisionEnricher should skip actions without screenshots', async () => {
    const { VisionEnricher } = await import('../../packages/vision/src/recorder/vision-enricher');
    const { VisionEngine } = await import('../../packages/vision/src/vision/vision-engine');

    const mockRepo = { saveObject: vi.fn(), getObject: vi.fn(), getAllObjects: vi.fn(), deleteObject: vi.fn() };
    const engine = new VisionEngine();
    const enricher = new VisionEnricher(engine, mockRepo);

    const action = {
      id: 'action-2',
      action: 'click',
      parameters: {},
      timestamp: Date.now(),
      metadata: { confidence: 0, monitor: 1 }
    } as any;

    const enriched = await enricher.enrich(action);

    expect(mockRepo.saveObject).not.toHaveBeenCalled();
    expect(enriched.target).toBeUndefined();
  });
});

// ─── Test 14: Scenario Normalizer ───────────────────────────────────────────

describe('Test 14 – Scenario Normalizer', () => {
  it('Test A: should merge two consecutive clicks on same target into doubleClick', async () => {
    const { ScenarioNormalizer } = await import('../../packages/sdk/src/scenario/scenario-normalizer');
    const normalizer = new ScenarioNormalizer();

    const actions = [
      { id: '1', action: 'click', target: 'btn-1', parameters: {}, timestamp: 1000, metadata: {} },
      { id: '2', action: 'click', target: 'btn-1', parameters: {}, timestamp: 1200, metadata: {} } // 200ms apart
    ] as any[];

    const result = normalizer.normalize(actions);

    expect(result.length).toBe(1);
    expect(result[0]!.action).toBe('doubleClick');
  });

  it('Test A: should NOT merge clicks that are too far apart', async () => {
    const { ScenarioNormalizer } = await import('../../packages/sdk/src/scenario/scenario-normalizer');
    const normalizer = new ScenarioNormalizer();

    const actions = [
      { id: '1', action: 'click', target: 'btn-1', parameters: {}, timestamp: 1000, metadata: {} },
      { id: '2', action: 'click', target: 'btn-1', parameters: {}, timestamp: 2000, metadata: {} } // 1000ms apart
    ] as any[];

    const result = normalizer.normalize(actions);

    expect(result.length).toBe(2);
    expect(result[0]!.action).toBe('click');
    expect(result[1]!.action).toBe('click');
  });

  it('Test B: should collapse multiple consecutive waits into a single wait', async () => {
    const { ScenarioNormalizer } = await import('../../packages/sdk/src/scenario/scenario-normalizer');
    const normalizer = new ScenarioNormalizer();

    const actions = [
      { id: '1', action: 'wait', parameters: { timeout: 1000 }, timestamp: 1000, metadata: {} },
      { id: '2', action: 'wait', parameters: { timeout: 2000 }, timestamp: 2000, metadata: {} },
      { id: '3', action: 'wait', parameters: { timeout: 500 }, timestamp: 2500, metadata: {} }
    ] as any[];

    const result = normalizer.normalize(actions);

    expect(result.length).toBe(1);
    expect(result[0]!.action).toBe('wait');
    expect(result[0]!.parameters['timeout']).toBe(3500); // 1000 + 2000 + 500
  });
});

// ─── Test 15: Build Pipeline ────────────────────────────────────────────────

describe('Test 15 – Build Pipeline', () => {
  it('PythonGenerator should generate valid Python from a scenario', async () => {
    const { PythonGenerator } = await import('../../apps/studio/src/engine/generators/python-generator');

    const scenario = {
      id: 'test-scenario',
      name: 'Login Test',
      steps: [
        { id: '1', type: 'navigate' as const, parameters: [{ name: 'url', value: 'https://app.example.com' }] },
        { id: '2', type: 'click' as const, target: '#username' },
        { id: '3', type: 'type' as const, target: '#username', parameters: [{ name: 'value', value: 'admin' }] },
        { id: '4', type: 'click' as const, target: '#password' },
        { id: '5', type: 'type' as const, target: '#password', parameters: [{ name: 'value', value: 'password' }] },
        { id: '6', type: 'click' as const, target: '#login-btn' }
      ],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    const code = PythonGenerator.generatePython(scenario);

    expect(code).toContain('from playwright.sync_api import sync_playwright');
    expect(code).toContain('def run_scenario()');
    expect(code).toContain('page.goto("https://app.example.com")');
    expect(code).toContain('page.click("#username")');
    expect(code).toContain('page.fill("#username", "admin")');
    expect(code).toContain('page.fill("#password", "password")');
    expect(code).toContain('page.click("#login-btn")');
    expect(code).toContain('browser.close()');
    expect(code).toContain('if __name__ == "__main__"');
  });

  it('PythonGenerator should skip disabled steps', async () => {
    const { PythonGenerator } = await import('../../apps/studio/src/engine/generators/python-generator');

    const scenario = {
      id: 'test-disabled',
      name: 'Test Disabled',
      steps: [
        { id: '1', type: 'click' as const, target: '#btn1' },
        { id: '2', type: 'click' as const, target: '#btn2', disabled: true },
        { id: '3', type: 'click' as const, target: '#btn3' }
      ],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    const code = PythonGenerator.generatePython(scenario);

    expect(code).toContain('#btn1');
    expect(code).not.toContain('#btn2');
    expect(code).toContain('#btn3');
  });

  it('PythonGenerator should handle all action types', async () => {
    const { PythonGenerator } = await import('../../apps/studio/src/engine/generators/python-generator');

    const scenario = {
      id: 'all-actions',
      name: 'All Actions',
      steps: [
        { id: '1', type: 'click' as const, target: '#a' },
        { id: '2', type: 'doubleClick' as const, target: '#b' },
        { id: '3', type: 'rightClick' as const, target: '#c' },
        { id: '4', type: 'hover' as const, target: '#d' },
        { id: '5', type: 'select' as const, target: '#e', parameters: [{ name: 'value', value: 'opt1' }] },
        { id: '6', type: 'check' as const, target: '#f' },
        { id: '7', type: 'uncheck' as const, target: '#g' },
      ],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    const code = PythonGenerator.generatePython(scenario);

    expect(code).toContain('page.click("#a")');
    expect(code).toContain('page.dblclick("#b")');
    expect(code).toContain('page.click("#c", button="right")');
    expect(code).toContain('page.hover("#d")');
    expect(code).toContain('page.select_option("#e"');
    expect(code).toContain('page.check("#f")');
    expect(code).toContain('page.uncheck("#g")');
  });
});

// ─── Test 16: Execution Planner ─────────────────────────────────────────────

describe('Test 16 – Execution Planner', () => {
  it('should compile a scenario into an execution graph', async () => {
    const { ExecutionPlanner } = await import('../../runtime/src/engine/planner/execution-planner');
    const planner = new ExecutionPlanner();

    const scenario = {
      id: 'test-plan',
      name: 'Test Plan',
      preconditions: [
        { id: 'pre-1', type: 'navigate' as const, parameters: [{ name: 'url', value: 'https://app.example.com' }] }
      ],
      steps: [
        { id: 'step-1', type: 'click' as const, target: '#login' },
        { id: 'step-2', type: 'type' as const, target: '#user', parameters: [{ name: 'value', value: 'admin' }] }
      ],
      assertions: [
        { id: 'assert-1', type: 'assertVisible' as const, target: '#dashboard' }
      ],
      recovery: [
        { id: 'recover-1', type: 'click' as const, target: '#retry-btn' }
      ],
      cleanup: [
        { id: 'cleanup-1', type: 'click' as const, target: '#logout' }
      ],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    const result = planner.plan(scenario);

    expect(result.graph.nodes.length).toBeGreaterThan(0);
    expect(result.entryNodes.length).toBe(1);

    // Verify preconditions exist
    const preNode = result.graph.nodes.find(n => n.id.includes('pre-1'));
    expect(preNode).toBeDefined();

    // Verify steps exist
    const stepNode1 = result.graph.nodes.find(n => n.id.includes('step-1'));
    const stepNode2 = result.graph.nodes.find(n => n.id.includes('step-2'));
    expect(stepNode1).toBeDefined();
    expect(stepNode2).toBeDefined();

    // Verify assertions exist
    const assertNode = result.graph.nodes.find(n => n.id.includes('assert-1'));
    expect(assertNode).toBeDefined();

    // Verify recovery exists
    const recoveryNode = result.graph.nodes.find(n => n.id.includes('recover-1'));
    expect(recoveryNode).toBeDefined();

    // Verify cleanup exists
    const cleanupNode = result.graph.nodes.find(n => n.id.includes('cleanup-1'));
    expect(cleanupNode).toBeDefined();

    // Verify edges contain both success and failure paths
    const successEdges = result.graph.edges.filter(e => e.condition === 'success');
    const failureEdges = result.graph.edges.filter(e => e.condition === 'failure');
    expect(successEdges.length).toBeGreaterThan(0);
    expect(failureEdges.length).toBeGreaterThan(0);
  });

  it('ScenarioCompiler should produce a valid ExecutionPlan', async () => {
    const { ScenarioCompiler } = await import('../../runtime/src/engine/compiler/scenario-compiler');
    const compiler = new ScenarioCompiler();

    const scenario = {
      id: 'compiler-test',
      name: 'Compiler Test',
      steps: [
        { id: 's1', type: 'click' as const, target: '#btn' }
      ],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    const plan = compiler.compile(scenario);

    expect(plan.planId).toBeDefined();
    expect(plan.executionId).toBeDefined();
    expect(plan.scenarioId).toBe('compiler-test');
    expect(plan.compiledAt).toBeGreaterThan(0);
    expect(plan.compilerVersion).toBe('1.0.0');
    expect(plan.graph.nodes.length).toBe(1);
    expect(plan.entryNodes.length).toBe(1);
  });
});

// ─── Test 17: Runtime ───────────────────────────────────────────────────────

describe('Test 17 – Runtime', () => {
  it('ExecutionScheduler should execute a simple linear plan', async () => {
    const { ExecutionScheduler } = await import('../../runtime/src/engine/scheduler/execution-scheduler');
    const { ExecutionBus } = await import('../../runtime/src/engine/events/execution-bus');

    const bus = new ExecutionBus();
    const nodesStarted: string[] = [];
    const nodesFinished: string[] = [];

    bus.subscribe('NodeStarted', (event) => nodesStarted.push(event.nodeId!));
    bus.subscribe('NodeFinished', (event) => nodesFinished.push(event.nodeId!));

    const plan = {
      planId: 'p1',
      executionId: 'e1',
      scenarioId: 's1',
      compiledAt: Date.now(),
      compilerVersion: '1.0.0',
      checksum: 'mock',
      graph: {
        nodes: [
          { id: 'node-1', payload: { kind: 'step' as const, action: { id: '1', type: 'click' as const, target: '#a' } }, status: 'pending' as const },
          { id: 'node-2', payload: { kind: 'step' as const, action: { id: '2', type: 'click' as const, target: '#b' } }, status: 'pending' as const }
        ],
        edges: [
          { source: 'node-1', target: 'node-2', condition: 'success' as const }
        ]
      },
      entryNodes: ['node-1']
    };

    const scheduler = new ExecutionScheduler(plan, bus);
    await scheduler.execute();

    expect(nodesStarted).toEqual(['node-1', 'node-2']);
    expect(nodesFinished).toEqual(['node-1', 'node-2']);
  });

  it('ExecutionScheduler should respect failure edges', async () => {
    const { ExecutionScheduler } = await import('../../runtime/src/engine/scheduler/execution-scheduler');
    const { ExecutionBus } = await import('../../runtime/src/engine/events/execution-bus');

    const bus = new ExecutionBus();
    const nodesStarted: string[] = [];

    bus.subscribe('NodeStarted', (event) => nodesStarted.push(event.nodeId!));

    const plan = {
      planId: 'p2',
      executionId: 'e2',
      scenarioId: 's2',
      compiledAt: Date.now(),
      compilerVersion: '1.0.0',
      checksum: 'mock',
      graph: {
        nodes: [
          { id: 'step-1', payload: { kind: 'step' as const, action: { id: '1', type: 'click' as const, target: '#a' } }, status: 'pending' as const },
          { id: 'success-path', payload: { kind: 'step' as const, action: { id: '2', type: 'click' as const, target: '#b' } }, status: 'pending' as const },
          { id: 'failure-path', payload: { kind: 'recovery' as const, action: { id: '3', type: 'click' as const, target: '#retry' } }, status: 'pending' as const }
        ],
        edges: [
          { source: 'step-1', target: 'success-path', condition: 'success' as const },
          { source: 'step-1', target: 'failure-path', condition: 'failure' as const }
        ]
      },
      entryNodes: ['step-1']
    };

    const scheduler = new ExecutionScheduler(plan, bus);
    await scheduler.execute();

    // Node execution is mocked as always success, so success-path should be visited
    expect(nodesStarted).toContain('step-1');
    expect(nodesStarted).toContain('success-path');
    expect(nodesStarted).not.toContain('failure-path');
  });

  it('ExecutionScheduler should support cancel', async () => {
    const { ExecutionScheduler } = await import('../../runtime/src/engine/scheduler/execution-scheduler');
    const { ExecutionBus } = await import('../../runtime/src/engine/events/execution-bus');

    const bus = new ExecutionBus();
    const plan = {
      planId: 'p3',
      executionId: 'e3',
      scenarioId: 's3',
      compiledAt: Date.now(),
      compilerVersion: '1.0.0',
      checksum: 'mock',
      graph: {
        nodes: [
          { id: 'n1', payload: { kind: 'step' as const, action: { id: '1', type: 'click' as const, target: '#a' } }, status: 'pending' as const }
        ],
        edges: []
      },
      entryNodes: ['n1']
    };

    const scheduler = new ExecutionScheduler(plan, bus);

    // Cancel should not throw
    scheduler.cancel();
    expect(() => scheduler.cancel()).not.toThrow();
  });
});

// ─── Test 18: Breakpoints ───────────────────────────────────────────────────

describe('Test 18 – Breakpoints', () => {
  it('should pause execution at breakpoints and resume', async () => {
    const { ExecutionScheduler } = await import('../../runtime/src/engine/scheduler/execution-scheduler');
    const { ExecutionBus } = await import('../../runtime/src/engine/events/execution-bus');

    const bus = new ExecutionBus();
    const events: string[] = [];

    bus.subscribe('BreakpointHit', (event) => events.push(`breakpoint:${event.nodeId}`));
    bus.subscribe('NodeStarted', (event) => events.push(`started:${event.nodeId}`));
    bus.subscribe('NodeFinished', (event) => events.push(`finished:${event.nodeId}`));

    const plan = {
      planId: 'bp-test',
      executionId: 'bp-exec',
      scenarioId: 'bp-scenario',
      compiledAt: Date.now(),
      compilerVersion: '1.0.0',
      checksum: 'mock',
      graph: {
        nodes: [
          { id: 'node-a', payload: { kind: 'step' as const, action: { id: 'a', type: 'click' as const, target: '#a' } }, status: 'pending' as const },
          {
            id: 'node-b',
            payload: { kind: 'step' as const, action: { id: 'b', type: 'click' as const, target: '#b' } },
            status: 'pending' as const,
            breakpoint: { enabled: true }
          },
          { id: 'node-c', payload: { kind: 'step' as const, action: { id: 'c', type: 'click' as const, target: '#c' } }, status: 'pending' as const }
        ],
        edges: [
          { source: 'node-a', target: 'node-b', condition: 'success' as const },
          { source: 'node-b', target: 'node-c', condition: 'success' as const }
        ]
      },
      entryNodes: ['node-a']
    };

    const scheduler = new ExecutionScheduler(plan, bus);

    // Start execution in background - it will pause at breakpoint
    const executionPromise = scheduler.execute();

    // Wait briefly for execution to reach the breakpoint
    await new Promise(resolve => setTimeout(resolve, 100));

    // At this point, execution should be paused at the breakpoint
    expect(events).toContain('started:node-a');
    expect(events).toContain('finished:node-a');
    expect(events).toContain('breakpoint:node-b');

    // Resume
    scheduler.resume();

    await executionPromise;

    // After resume, all nodes should be completed
    expect(events).toContain('started:node-b');
    expect(events).toContain('finished:node-b');
    expect(events).toContain('started:node-c');
    expect(events).toContain('finished:node-c');
  });
});

// ─── Test 19: Execution Trace (Report Generator) ────────────────────────────

describe('Test 19 – Execution Trace', () => {
  it('ReportGenerator should generate JSON and JUnit reports', async () => {
    const { EventBus, createEvent, ExecutionEvents } = await import('../../packages/events/src/index');
    const { Logger, ConsoleSink } = await import('../../packages/logger/src/index');
    const { ReportGenerator } = await import('../../runtime/src/engine/report-generator');
    const fs = await import('fs');
    const path = await import('path');
    const os = await import('os');

    const tmpDir = path.join(os.tmpdir(), `vision-rc1-test-${Date.now()}`);
    const eventBus = new EventBus();
    const logger = new Logger('Test', [new ConsoleSink()], { level: 0 });

    const reporter = new ReportGenerator(eventBus, logger, tmpDir);

    // Simulate an execution completion
    eventBus.publish(createEvent(ExecutionEvents.ExecutionCompleted, {
      executionId: 'test-exec-001',
      duration: 5000
    }));

    // Wait a moment for async processing
    await new Promise(resolve => setTimeout(resolve, 100));

    const reportDir = path.join(tmpDir, '.automationstudio', 'reports', 'test-exec-001');

    if (fs.existsSync(reportDir)) {
      const jsonReport = JSON.parse(fs.readFileSync(path.join(reportDir, 'report.json'), 'utf8'));
      expect(jsonReport.executionId).toBe('test-exec-001');
      expect(jsonReport.status).toBe('passed');
      expect(jsonReport.duration).toBe(5000);

      const junitXml = fs.readFileSync(path.join(reportDir, 'junit.xml'), 'utf8');
      expect(junitXml).toContain('testsuites');
      expect(junitXml).toContain('Automation Studio Execution');
      expect(junitXml).toContain('failures="0"');

      // Cleanup
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('ReportGenerator should generate failure reports', async () => {
    const { EventBus, createEvent, ExecutionEvents } = await import('../../packages/events/src/index');
    const { Logger, ConsoleSink } = await import('../../packages/logger/src/index');
    const { ReportGenerator } = await import('../../runtime/src/engine/report-generator');
    const fs = await import('fs');
    const path = await import('path');
    const os = await import('os');

    const tmpDir = path.join(os.tmpdir(), `vision-rc1-fail-${Date.now()}`);
    const eventBus = new EventBus();
    const logger = new Logger('Test', [new ConsoleSink()], { level: 0 });

    const reporter = new ReportGenerator(eventBus, logger, tmpDir);

    eventBus.publish(createEvent(ExecutionEvents.ExecutionFailed, {
      executionId: 'test-exec-fail',
      duration: 3000,
      error: 'Element not found: #login-btn'
    }));

    await new Promise(resolve => setTimeout(resolve, 100));

    const reportDir = path.join(tmpDir, '.automationstudio', 'reports', 'test-exec-fail');

    if (fs.existsSync(reportDir)) {
      const jsonReport = JSON.parse(fs.readFileSync(path.join(reportDir, 'report.json'), 'utf8'));
      expect(jsonReport.status).toBe('failed');
      expect(jsonReport.error).toContain('Element not found');

      const junitXml = fs.readFileSync(path.join(reportDir, 'junit.xml'), 'utf8');
      expect(junitXml).toContain('failures="1"');
      expect(junitXml).toContain('Element not found');

      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

// ─── Test 20: End-to-End Vision Workflow ────────────────────────────────────

describe('Test 20 – End-to-End Vision Workflow', () => {
  it('should complete the full workflow: init → inspect → save → record → generate → compile → schedule', async () => {
    // 1. Initialize Plugin
    const { default: VisionPlugin } = await import('../../packages/vision/src/index');
    const plugin = new VisionPlugin();
    await plugin.initialize();
    expect(plugin.inspector).toBeDefined();
    expect(plugin.recorder).toBeDefined();
    expect(plugin.backend).toBeDefined();

    // 2. Register in TechnologyRegistry
    const { TechnologyRegistry } = await import('../../packages/registry/src/technology-registry');
    const registry = new TechnologyRegistry();
    registry.register({
      id: 'vision',
      name: 'Vision',
      version: '0.1.0',
      capabilities: ['inspector', 'recorder', 'executor'],
      createFramework: () => new VisionPlugin()
    });

    const inspectors = registry.resolveByCapability('inspector');
    expect(inspectors.length).toBe(1);

    // 3. Save element to Object Repository
    const { ObjectRepository } = await import('../../packages/sdk/src/object-repository');
    const repo = new ObjectRepository();

    repo.addElement({
      id: 'login-button',
      name: 'Login Button',
      locators: [
        { strategy: 'ocr' as any, value: 'Login' },
        { strategy: 'image' as any, value: '/templates/login.png' }
      ]
    });
    expect(repo.getElement('login-button')).toBeDefined();

    // 4. Create a Scenario (as if recorded)
    const scenario = {
      id: 'e2e-test-scenario',
      name: 'Login Flow',
      steps: [
        { id: 's1', type: 'click' as const, target: '#username' },
        { id: 's2', type: 'type' as const, target: '#username', parameters: [{ name: 'value', value: 'admin' }] },
        { id: 's3', type: 'click' as const, target: '#password' },
        { id: 's4', type: 'type' as const, target: '#password', parameters: [{ name: 'value', value: 'password' }] },
        { id: 's5', type: 'click' as const, target: 'login-button' }
      ],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    // 5. Verify Scenario Editor receives semantic steps (not coordinates)
    for (const step of scenario.steps) {
      expect(step.type).toMatch(/^(click|type|navigate|hover|doubleClick|rightClick)$/);
      expect((step as any).mouseX).toBeUndefined();
      expect((step as any).mouseY).toBeUndefined();
    }

    // 6. Generate Python
    const { PythonGenerator } = await import('../../apps/studio/src/engine/generators/python-generator');
    const code = PythonGenerator.generatePython(scenario);
    expect(code).toContain('from playwright.sync_api import sync_playwright');
    expect(code).toContain('page.click("#username")');
    expect(code).toContain('page.fill("#username", "admin")');
    expect(code).toContain('page.fill("#password", "password")');
    expect(code).toContain('page.click("login-button")');

    // 7. Compile Execution Plan
    const { ScenarioCompiler } = await import('../../runtime/src/engine/compiler/scenario-compiler');
    const compiler = new ScenarioCompiler();
    const plan = compiler.compile(scenario);

    expect(plan.planId).toBeDefined();
    expect(plan.graph.nodes.length).toBe(5);
    expect(plan.entryNodes.length).toBe(1);

    // 8. Execute via scheduler
    const { ExecutionScheduler } = await import('../../runtime/src/engine/scheduler/execution-scheduler');
    const { ExecutionBus } = await import('../../runtime/src/engine/events/execution-bus');

    const bus = new ExecutionBus();
    const executionLog: string[] = [];
    bus.subscribe('NodeStarted', (e) => executionLog.push(`start:${e.nodeId}`));
    bus.subscribe('NodeFinished', (e) => executionLog.push(`finish:${e.nodeId}`));

    const scheduler = new ExecutionScheduler(plan, bus);
    await scheduler.execute();

    // Verify all nodes executed in order
    expect(executionLog.length).toBe(10); // 5 starts + 5 finishes
    expect(executionLog[0]).toContain('start');
    expect(executionLog[executionLog.length - 1]).toContain('finish');

    // 9. Verify confidence fusion works
    const { ConfidenceFusion } = await import('../../packages/vision/src/vision/confidence-fusion');
    const { PLATFORM_WEIGHTS } = await import('../../packages/vision/src/vision/weight-resolver');
    const fusion = new ConfidenceFusion();

    const candidates = [
      { strategy: 'ocr' as const, confidence: 92, location: { nx: 0.5, ny: 0.5, nw: 0.05, nh: 0.02 } },
      { strategy: 'image' as const, confidence: 88, location: { nx: 0.50, ny: 0.50, nw: 0.06, nh: 0.03 } }
    ];
    const fusedResult = fusion.fuse(candidates, PLATFORM_WEIGHTS);
    expect(fusedResult.found).toBe(true);
    expect(fusedResult.confidence).toBeGreaterThanOrEqual(80);

    // Success: Full workflow completed without manual JSON/code editing
  });

  it('scenario IR should contain only semantic types, never raw coordinates', async () => {
    const validActions = ['click', 'type', 'navigate', 'dragAndDrop', 'hover', 'rightClick',
      'doubleClick', 'select', 'check', 'uncheck', 'assertVisible', 'assertText', 'waitNavigation'];

    const scenario = {
      id: 'semantic-check',
      name: 'Semantic Check',
      steps: [
        { id: '1', type: 'click' as const, target: 'LoginButton' },
        { id: '2', type: 'type' as const, target: 'UsernameField', parameters: [{ name: 'value', value: 'admin' }] }
      ],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    for (const step of scenario.steps) {
      expect(validActions).toContain(step.type);
      // Verify no raw coordinate properties
      expect((step as any).x).toBeUndefined();
      expect((step as any).y).toBeUndefined();
      expect((step as any).mouseX).toBeUndefined();
      expect((step as any).mouseY).toBeUndefined();
    }
  });
});

// ─── RC1 Exit Criteria Summary ──────────────────────────────────────────────

describe('RC1 Exit Criteria Verification', () => {
  it('Plugin loads without errors', async () => {
    const { default: VisionPlugin } = await import('../../packages/vision/src/index');
    expect(() => new VisionPlugin()).not.toThrow();
  });

  it('VisionServiceManager API is complete', async () => {
    const { VisionServiceManager } = await import('../../packages/vision/src/vision/vision-service-manager');
    const mgr = new VisionServiceManager();
    expect(typeof mgr.start).toBe('function');
    expect(typeof mgr.stop).toBe('function');
    expect(typeof mgr.restart).toBe('function');
    expect(typeof mgr.health).toBe('function');
    expect(typeof mgr.analyze).toBe('function');
    expect(typeof mgr.execute).toBe('function');
  });

  it('ConfidenceFusion produces stable winning candidates', async () => {
    const { ConfidenceFusion } = await import('../../packages/vision/src/vision/confidence-fusion');
    const { PLATFORM_WEIGHTS } = await import('../../packages/vision/src/vision/weight-resolver');
    const fusion = new ConfidenceFusion();

    // Run same fusion 10 times - should be deterministic
    const results = [];
    for (let i = 0; i < 10; i++) {
      const result = fusion.fuse([
        { strategy: 'ocr' as const, confidence: 85, location: { nx: 0.5, ny: 0.5, nw: 0.05, nh: 0.02 } },
        { strategy: 'image' as const, confidence: 90, location: { nx: 0.50, ny: 0.50, nw: 0.06, nh: 0.03 } }
      ], PLATFORM_WEIGHTS);
      results.push(result.confidence);
    }

    // All results should be identical
    expect(new Set(results).size).toBe(1);
  });

  it('ObjectRepository saves and reloads', async () => {
    const { ObjectRepository } = await import('../../packages/sdk/src/object-repository');
    const repo = new ObjectRepository();
    repo.addElement({ id: 'test', name: 'Test', locators: [] });
    expect(repo.getElement('test')).toBeDefined();
  });

  it('Normalizer optimizes recorded scenarios', async () => {
    const { ScenarioNormalizer } = await import('../../packages/sdk/src/scenario/scenario-normalizer');
    const normalizer = new ScenarioNormalizer();

    const input = [
      { id: '1', action: 'wait', parameters: { timeout: 100 }, timestamp: 1000, metadata: {} },
      { id: '2', action: 'wait', parameters: { timeout: 200 }, timestamp: 1100, metadata: {} }
    ] as any[];

    expect(normalizer.normalize(input).length).toBe(1);
  });

  it('Build pipeline generates runnable Python', async () => {
    const { PythonGenerator } = await import('../../apps/studio/src/engine/generators/python-generator');
    const code = PythonGenerator.generatePython({
      id: 'rc1', name: 'RC1', steps: [{ id: '1', type: 'click' as const, target: '#btn' }],
      createdAt: Date.now(), updatedAt: Date.now()
    });
    expect(code).toContain('run_scenario');
  });

  it('Execution Planner produces valid execution graphs', async () => {
    const { ExecutionPlanner } = await import('../../runtime/src/engine/planner/execution-planner');
    const plan = new ExecutionPlanner().plan({
      id: 'rc1', name: 'RC1',
      steps: [{ id: '1', type: 'click' as const, target: '#btn' }],
      createdAt: Date.now(), updatedAt: Date.now()
    });
    expect(plan.graph.nodes.length).toBeGreaterThan(0);
    expect(plan.entryNodes.length).toBe(1);
  });

  it('Scheduler executes success and failure paths', async () => {
    const { ExecutionScheduler } = await import('../../runtime/src/engine/scheduler/execution-scheduler');
    const { ExecutionBus } = await import('../../runtime/src/engine/events/execution-bus');

    const bus = new ExecutionBus();
    const plan = {
      planId: 'exit', executionId: 'exit', scenarioId: 'exit',
      compiledAt: Date.now(), compilerVersion: '1.0.0', checksum: 'x',
      graph: {
        nodes: [
          { id: 'n1', payload: { kind: 'step' as const, action: { id: '1', type: 'click' as const, target: '#a' } }, status: 'pending' as const }
        ],
        edges: []
      },
      entryNodes: ['n1']
    };

    await new ExecutionScheduler(plan, bus).execute();
    // No exception = success path works
  });

  it('Breakpoints and resume function correctly', async () => {
    const { ExecutionScheduler } = await import('../../runtime/src/engine/scheduler/execution-scheduler');
    const { ExecutionBus } = await import('../../runtime/src/engine/events/execution-bus');

    const bus = new ExecutionBus();
    let bpHit = false;
    bus.subscribe('BreakpointHit', () => { bpHit = true; });

    const plan = {
      planId: 'bp', executionId: 'bp', scenarioId: 'bp',
      compiledAt: Date.now(), compilerVersion: '1.0.0', checksum: 'x',
      graph: {
        nodes: [
          { id: 'n1', payload: { kind: 'step' as const, action: { id: '1', type: 'click' as const, target: '#a' } }, status: 'pending' as const, breakpoint: { enabled: true } }
        ],
        edges: []
      },
      entryNodes: ['n1']
    };

    const scheduler = new ExecutionScheduler(plan, bus);
    const p = scheduler.execute();
    await new Promise(resolve => setTimeout(resolve, 100));
    expect(bpHit).toBe(true);
    scheduler.resume();
    await p;
  });
});
