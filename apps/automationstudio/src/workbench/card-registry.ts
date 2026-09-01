import type { IDisposable, ILogger } from '@automation-studio/types';
import type { ICardProvider, ICardRegistry } from './workbench-types';
import { toDisposable } from '@automation-studio/shared';

export class CardRegistry implements ICardRegistry {
  private readonly cards = new Map<string, ICardProvider>();

  constructor(private readonly logger: ILogger) {}

  public registerCard(card: ICardProvider): IDisposable {
    if (this.cards.has(card.cardId)) {
      this.logger.warn(`Overwriting existing card: ${card.cardId}`);
    }
    
    this.cards.set(card.cardId, card);
    this.logger.debug(`Registered Home Card: ${card.cardId}`);
    
    return toDisposable(() => {
      this.cards.delete(card.cardId);
    });
  }

  public getCards(): ICardProvider[] {
    return Array.from(this.cards.values())
      .sort((a, b) => b.priority - a.priority);
  }
}
