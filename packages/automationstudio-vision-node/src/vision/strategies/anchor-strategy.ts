import type { ILocatorStrategy, VisionStrategyType, IAnchorLocator, NormalizedBox, Candidate, CaptureContext } from '../vision-types';

/**
 * Anchor Strategy Resolver.
 *
 * The most important strategy for resolution-independent automation.
 * Instead of searching for the target directly, it:
 * 1. Locates a highly stable nearby element (the "anchor")
 * 2. Applies a known spatial offset from the anchor's position
 *
 * This makes the locator survive resolution changes, window repositioning,
 * and minor UI reflows — as long as the spatial relationship is preserved.
 */
export class AnchorStrategyResolver {
  readonly type: VisionStrategyType = 'anchor';

  private resolveAnchorFn: (strategy: ILocatorStrategy, screenshot: Buffer, context: CaptureContext) => Promise<Candidate[]>;

  constructor(resolveAnchorFn: (strategy: ILocatorStrategy, screenshot: Buffer, context: CaptureContext) => Promise<Candidate[]>) {
    this.resolveAnchorFn = resolveAnchorFn;
  }

  async resolve(strategy: ILocatorStrategy, screenshot: Buffer, context: CaptureContext): Promise<Candidate[]> {
    // The strategy.value contains the serialized anchor definition.
    let anchorDef: IAnchorLocator;
    try {
      anchorDef = JSON.parse(strategy.value) as IAnchorLocator;
    } catch {
      return [];
    }

    // Step 1: Locate the anchor
    const anchorCandidates = await this.resolveAnchorFn(anchorDef.anchorStrategy, screenshot, context);

    if (anchorCandidates.length === 0) {
      return [];
    }
    
    // Use the best anchor candidate
    const anchorResult = anchorCandidates[0];
    if (!anchorResult) return [];

    // Step 2: Compute target position relative to anchor
    const anchorCenter = {
      nx: anchorResult.location.nx + anchorResult.location.nw / 2,
      ny: anchorResult.location.ny + anchorResult.location.nh / 2
    };

    // Assuming offsetX/offsetY are normalized (-1 to 1) in the new system. 
    // If they were pixels, we'd divide by context.width/height, but for forward compatibility we treat them as normalized or easily normalized.
    // For M2, we will assume they are normalized (nox, noy). If not, we convert:
    const nox = Math.abs(anchorDef.offsetX) > 1 ? anchorDef.offsetX / context.width : anchorDef.offsetX;
    const noy = Math.abs(anchorDef.offsetY) > 1 ? anchorDef.offsetY / context.height : anchorDef.offsetY;

    const nw = 20 / context.width;
    const nh = 20 / context.height;
    
    const targetLocation: NormalizedBox = {
      nx: anchorCenter.nx + nox - (nw/2),
      ny: anchorCenter.ny + noy - (nh/2),
      nw,
      nh
    };

    const confidence = Math.round(anchorResult.confidence * 0.9);

    return [{
      strategy: 'anchor',
      confidence,
      location: targetLocation,
      metadata: {
        anchorLocation: anchorResult.location,
        anchorConfidence: anchorResult.confidence,
        nox,
        noy
      }
    }];
  }
}
