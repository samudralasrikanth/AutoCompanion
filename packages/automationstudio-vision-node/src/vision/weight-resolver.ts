import type { VisionStrategyType, IVisionLocator } from './vision-types';

/**
 * Platform default weights for each strategy type.
 * Higher weight = more influence on the fused confidence.
 */
export const PLATFORM_WEIGHTS: Record<VisionStrategyType, number> = {
  ocr: 0.30,
  image: 0.35,
  coordinate: 0.05,
  relativePosition: 0.10,
  color: 0.05,
  size: 0.05,
  shape: 0.05,
  anchor: 0.30
};

export class WeightResolver {
  private projectWeights: Partial<Record<VisionStrategyType, number>> = {};
  private techDefaults: Partial<Record<VisionStrategyType, number>> = {};

  constructor(
    projectWeights?: Partial<Record<VisionStrategyType, number>>,
    techDefaults?: Partial<Record<VisionStrategyType, number>>
  ) {
    if (projectWeights) this.projectWeights = projectWeights;
    if (techDefaults) this.techDefaults = techDefaults;
  }

  /**
   * Resolves the final weight dictionary hierarchically:
   * Platform -> Project -> Technology -> Locator Overrides
   */
  public resolveWeights(locator: IVisionLocator): Record<VisionStrategyType, number> {
    return {
      ...PLATFORM_WEIGHTS,
      ...this.projectWeights,
      ...this.techDefaults,
      ...(locator.weightOverrides || {})
    };
  }
}
