import type { IVisualObject } from '@automation-studio/sdk/src/repository/object-repository';
import type { IVisionLocator, ILocatorStrategy, VisionStrategyType } from '../vision/vision-types';

export function mapToVisionLocator(obj: IVisualObject): IVisionLocator {
  const strategies: ILocatorStrategy[] = [];

  if (obj.definition.ocr) {
    strategies.push({ type: 'ocr', value: obj.definition.ocr.text });
  }

  if (obj.definition.image) {
    strategies.push({ type: 'image', value: obj.definition.image.path });
  }

  return { strategies };
}
