import { Injectable } from '@nestjs/common';
import type { Deck } from '@prisma/client';
import { DecksPrismaService } from '../decks.prisma.service';

@Injectable()
export class ListDecksUseCase {
  constructor(private readonly decksPrismaService: DecksPrismaService) {}

  execute(userId: string): Promise<Deck[]> {
    return this.decksPrismaService.findAllByUserId(userId);
  }
}
