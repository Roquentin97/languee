import type {
  CardWithAnkiDroidExport,
  CardWithRelations,
} from '../cards.service';
import type {
  CardDetailResponseDto,
  CardListItemResponseDto,
  CardResponseDto,
  CreateCardsResponseDto,
} from '../dto/card-response.dto';
import type { InflectionForms } from '../../dictionary/types/inflection-forms.types';

function serializeDefinition(
  definition: CardWithRelations['definition'],
): CardResponseDto['definition'] {
  if (!definition) return null;
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

function serializeWord(card: CardWithRelations): CardResponseDto['word'] {
  const word = card.definition?.word ?? card.word;
  if (!word) {
    // Unreachable: every card carries either a definition (cloze /
    // definition cards) or a word (inflection cards).
    throw new Error(`card ${card.id} has neither a definition nor a word`);
  }
  return { id: word.id, lemma: word.lemma, language: word.language };
}

export function serializeCard(card: CardWithRelations): CardResponseDto {
  return {
    id: card.id,
    type: card.type,
    userId: card.userId,
    decks: card.decks,
    definitionId: card.definitionId,
    wordId: card.wordId,
    partOfSpeech: card.partOfSpeech,
    context: card.context ?? null,
    inflectionForms: (card.inflectionForms as InflectionForms | null) ?? null,
    createdAt: card.createdAt,
    updatedAt: card.updatedAt,
    definition: serializeDefinition(card.definition),
    word: serializeWord(card),
  };
}

export function serializeCards(
  cards: CardWithRelations[],
): CreateCardsResponseDto {
  return { cards: cards.map(serializeCard) };
}

export function serializeCardListItem(
  card: CardWithAnkiDroidExport,
): CardListItemResponseDto {
  return {
    ...serializeCard(card),
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
