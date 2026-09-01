import type { ILocatorStrategy, VisionStrategyType, Candidate, CaptureContext } from '../vision-types';

/**
 * Coordinate Strategy Resolver.
 *
 * The simplest and least stable locator. Always succeeds (the pixel exists),
 * but has zero tolerance for resolution changes, window repositioning, or
 * any kind of UI reflow. Intended as a last-resort fallback only.
 */
export class CoordinateStrategyResolver {
  readonly type: VisionStrategyType = 'coordinate';

  async resolve(strategy: ILocatorStrategy, _screenshot: Buffer, context: CaptureContext): Promise<Candidate[]> {
    const parts = strategy.value.split(',').map(Number);

    if (parts.length < 2 || parts.some(isNaN)) {
      return [];
    }

    const x = parts[0] ?? 0;
    const y = parts[1] ?? 0;
    const size = 20;

    return [{
      strategy: 'coordinate',
      confidence: 100, // Always "finds" the point
      location: {
        nx: Math.max(0, x - size / 2) / context.width,
        ny: Math.max(0, y - size / 2) / context.height,
        nw: size / context.width,
        nh: size / context.height
      },
      metadata: { stability: 0, note: 'Coordinate locators break on resolution/layout change.' }
    }];
  }
}
