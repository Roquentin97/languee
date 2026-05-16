import { Injectable } from '@nestjs/common';
import { DictionaryService } from '../dictionary/dictionary.service';
import { CardsService } from '../cards/cards.service';
import type {
  DeckRef,
  EnrichedDefinitionResult,
  LookupVocabularyInput,
  LookupVocabularyOutput,
} from './types/lookup-vocabulary.types';

@Injectable()
export class VocabularyService {
  constructor(
    private readonly dictionaryService: DictionaryService,
    private readonly cardsService: CardsService,
  ) {}

  async lookup(input: LookupVocabularyInput): Promise<LookupVocabularyOutput> {
    const baseOutput = await this.dictionaryService.lookup({
      word: input.word,
      language: input.language,
    });

    const definitionIds = baseOutput.definitions.map((d) => d.id);

    const cards = await this.cardsService.findCardsByDefinitionIdsAndUserId(
      definitionIds,
      input.userId,
    );

    const decksByDefinition = new Map<string, DeckRef[]>();
    for (const card of cards) {
      const existing = decksByDefinition.get(card.definitionId) ?? [];
      existing.push({ id: card.deck.id, name: card.deck.name });
      decksByDefinition.set(card.definitionId, existing);
    }

    const definitions: EnrichedDefinitionResult[] = baseOutput.definitions.map(
      (def) => ({
        id: def.id,
        partOfSpeech: def.part_of_speech,
        definition: def.definition,
        example: def.example,
        provider: def.provider,
        decks: decksByDefinition.get(def.id) ?? [],
      }),
    );

    return {
      lemma: baseOutput.lemma,
      source: baseOutput.source,
      definitions,
    };
  }
}
