import type {
  DefinitionOverlap,
  MeaningLinkListItem,
  MeaningLinkWithDefinitions,
} from '../synonyms.service';
import type {
  LinkedDefinitionResponseDto,
  MeaningLinkListItemResponseDto,
  MeaningLinkResponseDto,
} from '../dto/meaning-link-response.dto';
import type { OverlapResponseDto } from '../dto/overlap-response.dto';
import type { DefinitionSummary } from '../../definitions/definitions.service';

function serializeLinkedDefinition(
  definition: DefinitionSummary,
): LinkedDefinitionResponseDto {
  return {
    id: definition.id,
    partOfSpeech: definition.partOfSpeech,
    definition: definition.definition,
    lemma: definition.word.lemma,
    kind: definition.word.kind,
  };
}

export function serializeMeaningLink(
  link: MeaningLinkWithDefinitions,
): MeaningLinkResponseDto {
  return {
    id: link.id,
    relationType: link.relationType,
    source: link.source,
    createdAt: link.createdAt,
    definitionA: serializeLinkedDefinition(link.definitionA),
    definitionB: serializeLinkedDefinition(link.definitionB),
  };
}

export function serializeMeaningLinkListItem(
  item: MeaningLinkListItem,
): MeaningLinkListItemResponseDto {
  return {
    id: item.id,
    relationType: item.relationType,
    source: item.source,
    createdAt: item.createdAt,
    linked: {
      definitionId: item.linked.definitionId,
      definition: item.linked.definition,
      partOfSpeech: item.linked.partOfSpeech,
      lemma: item.linked.lemma,
      kind: item.linked.kind,
    },
  };
}

export function serializeOverlap(
  overlap: DefinitionOverlap,
): OverlapResponseDto {
  return {
    definitionId: overlap.definitionId,
    linkedDefinitionId: overlap.linkedDefinitionId,
    linkedLemma: overlap.linkedLemma,
    relationType: overlap.relationType,
    decks: overlap.decks.map((deck) => ({ id: deck.id, name: deck.name })),
  };
}
