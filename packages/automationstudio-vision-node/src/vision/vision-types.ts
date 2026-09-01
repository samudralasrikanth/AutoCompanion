// ─────────────────────────────────────────────────────────────────────────────
// Vision Engine — Core Interfaces
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A single locator strategy within a locator bundle.
 * Each strategy independently attempts to find the target on screen.
 */
export type VisionStrategyType =
  | 'ocr'
  | 'image'
  | 'coordinate'
  | 'relativePosition'
  | 'color'
  | 'size'
  | 'shape'
  | 'anchor';

export interface ILocatorStrategy {
  type: VisionStrategyType;
  value: string;        // text for OCR, path for image, "x,y" for coordinate, etc.
  metadata?: Record<string, unknown>;
}

/**
 * An anchor is a nearby, highly stable element used to compute
 * the target's position relative to a known reference point.
 * This is the key to resolution-independent automation.
 */
export interface IAnchorLocator {
  anchorStrategy: ILocatorStrategy;
  offsetX: number;
  offsetY: number;
}

/**
 * A locator bundle. The Vision Engine evaluates ALL strategies
 * and fuses their confidences into a single MatchResult.
 */
export interface IVisionLocator {
  strategies: ILocatorStrategy[];
  anchor?: IAnchorLocator;
  /** Optional per-locator weight overrides. Key = strategy type. */
  weightOverrides?: Partial<Record<VisionStrategyType, number>>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Resolution Independence
// ─────────────────────────────────────────────────────────────────────────────

export interface NormalizedPoint {
  nx: number;   // 0.0–1.0 relative to capture width
  ny: number;   // 0.0–1.0 relative to capture height
}

export interface NormalizedBox {
  nx: number;
  ny: number;
  nw: number;
  nh: number;
}

export interface CaptureContext {
  width: number;
  height: number;
  dpi: number;
  monitorIndex: number;
  scope: CaptureScope;
}

// ─────────────────────────────────────────────────────────────────────────────
// Match Results
// ─────────────────────────────────────────────────────────────────────────────

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Candidate {
  location: NormalizedBox;
  confidence: number;           // 0–100
  strategy: VisionStrategyType;
  metadata?: Record<string, unknown>;
}

export interface MatchResult {
  found: boolean;
  confidence: number;           // Fused from the winning cluster
  location: NormalizedBox;      // Centroid of the winning cluster
  cluster: Candidate[];         // The candidates that agreed spatially
  allCandidates: Candidate[];   // Everything, for debugging / AI healing
}

// ─────────────────────────────────────────────────────────────────────────────
// Strategy Resolver Interface
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Each locator strategy is backed by a resolver that can independently
 * search a screenshot for the target. The Vision Engine calls all
 * applicable resolvers, then fuses their results.
 */
export interface IStrategyResolver {
  readonly type: VisionStrategyType;
  resolve(strategy: ILocatorStrategy, screenshot: Buffer, context: CaptureContext): Promise<Candidate[]>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Vision Engine Contract
// ─────────────────────────────────────────────────────────────────────────────

export interface IVisionEngine {
  /** Find the best match for a locator on the current screen (or provided screenshot). */
  locate(locator: IVisionLocator, screenshot?: Buffer): Promise<MatchResult>;

  /** Find ALL matches for a locator (e.g. all "Submit" buttons on screen). */
  locateAll(locator: IVisionLocator, screenshot?: Buffer): Promise<MatchResult[]>;

  /** Poll until the locator is found or timeout expires. */
  waitFor(locator: IVisionLocator, timeoutMs?: number, pollIntervalMs?: number): Promise<MatchResult>;

  /** Returns true if the locator is currently visible. */
  exists(locator: IVisionLocator): Promise<boolean>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Capture Scope
// ─────────────────────────────────────────────────────────────────────────────

export type CaptureScope = 'desktop' | 'window' | 'region';

export interface CaptureOptions {
  scope: CaptureScope;
  /** Window handle or title (for 'window' scope). */
  windowTarget?: string;
  /** Fixed region (for 'region' scope). */
  region?: BoundingBox;
}
