import { Injectable } from '@nestjs/common';
import type { Deck } from '@prisma/client';
import { DecksPrismaService } from '../decks.prisma.service';
import { DeckNotFoundError } from '../decks.errors';

@Injectable()
export class ShowDeckUseCase {
  constructor(private readonly decksPrismaService: DecksPrismaService) {}

  async execute(id: string, userId: string): Promise<Deck> {
    const deck = await this.decksPrismaService.findOneByIdAndUserId(id, userId);
    if (deck === null) {
      throw new DeckNotFoundError();
    }
    return deck;
  }
}
