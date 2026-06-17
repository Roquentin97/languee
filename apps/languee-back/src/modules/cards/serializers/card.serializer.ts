import type {
  CardWithAnkiDroidExport,
  CardWithDefinitionAndWord,
} from '../cards.service';
import type {
  CardDetailResponseDto,
  CardListItemResponseDto,
  CardResponseDto,
} from '../dto/card-response.dto';
import type { InflectionForms } from '../../dictionary/types/inflection-forms.types';

function serializeDefinition(
  definition: CardWithDefinitionAndWord['definition'],
) {
  return {
    id: definition.id,
    partOfSpeech: definition.partOfSpeech,
    definition: definition.definition,
    example: definition.example ?? null,
    provider: definition.provider,
    inflectionForms:
      (definition.inflectionForms as InflectionForms | null) ?? null,
  };
}

export function serializeCard(
  card: CardWithDefinitionAndWord,
): CardResponseDto {
  return {
    id: card.id,
    deckId: card.deckId,
    userId: card.userId,
    definitionId: card.definitionId,
    context: card.context ?? null,
    inflectionForms:
      (card.inflectionForms as InflectionForms | null) ?? null,
    createdAt: card.createdAt,
    updatedAt: card.updatedAt,
    definition: serializeDefinition(card.definition),
    word: {
      id: card.definition.word.id,
      lemma: card.definition.word.lemma,
      language: card.definition.word.language,
    },
  };
}

export function serializeCardListItem(
  card: CardWithAnkiDroidExport,
): CardListItemResponseDto {
  return {
    id: card.id,
    deckId: card.deckId,
    userId: card.userId,
    definitionId: card.definitionId,
    context: card.context ?? null,
    inflectionForms:
      (card.inflectionForms as InflectionForms | null) ?? null,
    createdAt: card.createdAt,
    updatedAt: card.updatedAt,
    definition: serializeDefinition(card.definition),
    word: {
      id: card.definition.word.id,
      lemma: card.definition.word.lemma,
      language: card.definition.word.language,
    },
    ankiDroidExport: card.ankidroidExport
      ? {
          id: card.ankidroidExport.id,
          status: card.ankidroidExport.status,
          failureReason: card.ankidroidExport.failureReason,
          lastAttemptedAt: card.ankidroidExport.lastAttemptedAt,
          completedAt: card.ankidroidExport.completedAt,
        }
      : null,
  };
}

export function serializeCardDetail(
  card: CardWithAnkiDroidExport,
): CardDetailResponseDto {
  return serializeCardListItem(card);
}
