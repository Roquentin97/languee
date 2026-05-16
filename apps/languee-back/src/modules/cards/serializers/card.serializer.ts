import type { CardWithDefinitionAndWord } from '../cards.service';
import type { CardResponseDto } from '../dto/card-response.dto';

export function serializeCard(
  card: CardWithDefinitionAndWord,
): CardResponseDto {
  return {
    id: card.id,
    deckId: card.deckId,
    userId: card.userId,
    definitionId: card.definitionId,
    createdAt: card.createdAt,
    updatedAt: card.updatedAt,
    definition: {
      id: card.definition.id,
      partOfSpeech: card.definition.partOfSpeech,
      definition: card.definition.definition,
      example: card.definition.example ?? null,
      provider: card.definition.provider,
    },
    word: {
      id: card.definition.word.id,
      lemma: card.definition.word.lemma,
      language: card.definition.word.language,
    },
  };
}
