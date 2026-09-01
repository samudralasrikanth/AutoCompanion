import screenshot from 'screenshot-desktop';
import type {
  IVisionEngine,
  IVisionLocator,
  MatchResult,
  CaptureOptions,
  CaptureContext,
  Candidate
} from './vision-types';
import { ConfidenceFusion } from './confidence-fusion';
import { WeightResolver } from './weight-resolver';
import { VisionServiceManager, IVisionServiceManager } from './vision-service-manager';
import { CoordinateStrategyResolver } from './strategies/coordinate-strategy';
import { AnchorStrategyResolver } from './strategies/anchor-strategy';

/**
 * VisionEngine — The core orchestrator.
 *
 * Inspector, Recorder, Executor, and AI Healing all call this.
 * They never touch OCR, OpenCV, or template matching directly.
 *
 * Flow:
 *   locate(locator)
 *     → capture screenshot (if not provided)
 *     → for each strategy in locator.strategies
 *         → dispatch to the matching IStrategyResolver
 *     → pass all StrategyResults to ConfidenceFusion
 *     → return fused MatchResult
 */
export class VisionEngine implements IVisionEngine {
  public readonly serviceManager: IVisionServiceManager;
  private weightResolver: WeightResolver;
  private fusion: ConfidenceFusion;
  private captureOptions: CaptureOptions;
  
  // Local TS resolvers
  private coordinateResolver: CoordinateStrategyResolver;
  private anchorResolver: AnchorStrategyResolver;

  constructor(captureOptions?: CaptureOptions) {
    this.fusion = new ConfidenceFusion();
    this.weightResolver = new WeightResolver();
    this.captureOptions = captureOptions ?? { scope: 'desktop' };
    this.serviceManager = new VisionServiceManager();

    this.coordinateResolver = new CoordinateStrategyResolver();
    this.anchorResolver = new AnchorStrategyResolver(
      // Delegate back to engine
      (strategy, buf, ctx) => this.locate({ strategies: [strategy] }, buf).then(r => r.cluster)
    );
  }

  // ─── IVisionEngine ─────────────────────────────────────────────────────────

  async locate(locator: IVisionLocator, screenshotBuf?: Buffer): Promise<MatchResult> {
    const img = screenshotBuf ?? await this.captureScreenshot();
    
    // In Phase 1 we assume 1920x1080 if not provided
    const context: CaptureContext = {
      width: 1920,
      height: 1080,
      dpi: 96,
      monitorIndex: 0,
      scope: this.captureOptions.scope
    };

    let allCandidates: Candidate[] = [];

    // 1. Run sidecar-supported strategies (OCR, Image)
    const sidecarCandidates = await this.serviceManager.analyze(img, locator, context);
    allCandidates.push(...sidecarCandidates);

    // 2. Run TS-only strategies (Coordinate)
    for (const strategy of locator.strategies) {
      if (strategy.type === 'coordinate') {
        allCandidates.push(...await this.coordinateResolver.resolve(strategy, img, context));
      }
    }

    // 3. Run Anchor if defined
    if (locator.anchor) {
      const anchorStrategy = { type: 'anchor' as const, value: JSON.stringify(locator.anchor) };
      allCandidates.push(...await this.anchorResolver.resolve(anchorStrategy, img, context));
    }

    // 4. Fuse
    const weights = this.weightResolver.resolveWeights(locator);
    return this.fusion.fuse(allCandidates, weights);
  }

  async locateAll(locator: IVisionLocator, screenshotBuf?: Buffer): Promise<MatchResult[]> {
    const result = await this.locate(locator, screenshotBuf);
    return result.found ? [result] : [];
  }

  async waitFor(locator: IVisionLocator, timeoutMs = 10000, pollIntervalMs = 500): Promise<MatchResult> {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      const result = await this.locate(locator);
      if (result.found) {
        return result;
      }
      await this.sleep(pollIntervalMs);
    }

    // Final attempt
    return this.locate(locator);
  }

  async exists(locator: IVisionLocator): Promise<boolean> {
    const result = await this.locate(locator);
    return result.found;
  }

  // ─── Internal ──────────────────────────────────────────────────────────────

  private async captureScreenshot(): Promise<Buffer> {
    // Currently only supports desktop scope.
    // Window and Region scopes will be added in subsequent phases.
    const imgBuffer = await screenshot({ format: 'png' }) as Buffer;
    return imgBuffer;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
