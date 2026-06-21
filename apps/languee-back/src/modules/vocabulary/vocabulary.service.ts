import { Injectable } from '@nestjs/common';
import { DictionaryService } from '../dictionary/dictionary.service';
import { CardsService } from '../cards/cards.service';
import { NlpService } from '../nlp/nlp.service';
import { PartOfSpeech } from './enums/part-of-speech.enum';
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
    const nlpResult = await this.nlpService.analyzeWord(
      input.word,
      input.context,
    );

    const baseOutput = await this.dictionaryService.lookup({
      word: input.word,
      lemma: nlpResult.lemma,
      language: input.language,
      pos: nlpResult.pos ?? undefined,
      isIrregular: nlpResult.isIrregular,
      inflectionForms: nlpResult.inflectionForms,
    });

    const mappedPos: PartOfSpeech | null = nlpResult.pos;

    // Collect available parts of speech from all definitions before filtering
    const availablePartsOfSpeech: PartOfSpeech[] = [
      ...new Set(baseOutput.definitions.map((d) => d.partOfSpeech)),
    ];

    const hasContext = Boolean(input.context?.trim());
    const shouldFilterByPos =
      hasContext && !input.disablePosFiltering && mappedPos !== null;

    // Filter definitions by POS only for context-aware lookups.
    const filteredDefinitions = shouldFilterByPos
      ? baseOutput.definitions.filter((def) => def.partOfSpeech === mappedPos)
      : baseOutput.definitions;

    const filteredByPos = shouldFilterByPos;
    const unmatchedPos = filteredByPos && filteredDefinitions.length === 0;

    // Deck enrichment on filtered definitions
    const definitionIds = filteredDefinitions.map((d) => d.id);

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

    const definitions: EnrichedDefinitionResult[] = filteredDefinitions.map(
      (def) => ({
        id: def.id,
        partOfSpeech: def.partOfSpeech,
        definition: def.definition,
        example: def.example,
        provider: def.provider,
        hasIrregularForms: def.hasIrregularForms,
        inflectionForms: def.inflectionForms,
        decks: decksByDefinition.get(def.id) ?? [],
      }),
    );

    return {
      input: input.word,
      context: input.context,
      lemma: baseOutput.lemma,
      partOfSpeech: mappedPos,
      definitions,
      meta: {
        filteredByPos,
        unmatchedPos,
        availablePartsOfSpeech,
      },
    };
  }
}
