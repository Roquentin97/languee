import { Injectable } from '@nestjs/common';
import { DictionaryService } from '../dictionary/dictionary.service';
import { CardsService } from '../cards/cards.service';
import { NlpService } from '../nlp/nlp.service';
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
    private readonly nlpService: NlpService,
  ) {}

  async lookup(input: LookupVocabularyInput): Promise<LookupVocabularyOutput> {
    const nlpResult = await this.nlpService.analyzeWord(input.word);

    const baseOutput = await this.dictionaryService.lookup({
      word: input.word,
      lemma: nlpResult.lemma,
      language: input.language,
      pos: nlpResult.pos,
      isIrregular: nlpResult.isIrregular,
      inflectionForms: nlpResult.inflectionForms,
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
        hasIrregularForms: def.hasIrregularForms,
        inflectionForms: def.inflectionForms,
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
