import type { Deck } from '@prisma/client';
import type { DeckResponseDto } from '../dto/deck-response.dto';

export function serializeDeck(deck: Deck): DeckResponseDto {
  return {
    id: deck.id,
    userId: deck.userId,
    name: deck.name,
    createdAt: deck.createdAt,
    updatedAt: deck.updatedAt,
  };
}
