import { Injectable, Logger } from '@nestjs/common';
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
  private readonly logger = new Logger(VocabularyService.name);

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

    this.logger.debug({
      message: 'nlp result',
      event: 'vocabulary.nlp_result',
      method: this.lookup.name,
      data: {
        word: input.word,
        lemma: nlpResult.lemma,
        pos: nlpResult.pos,
        isIrregular: nlpResult.isIrregular,
      },
    });

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

    this.logger.debug({
      message: 'pos filter decision',
      event: 'vocabulary.pos_filter_decision',
      method: this.lookup.name,
      data: {
        shouldFilterByPos,
        hasContext,
        mappedPos,
        totalDefinitions: baseOutput.definitions.length,
      },
    });

    // Filter definitions by POS only for context-aware lookups.
    const filteredDefinitions = shouldFilterByPos
      ? baseOutput.definitions.filter((def) => def.partOfSpeech === mappedPos)
      : baseOutput.definitions;

    const filteredByPos = shouldFilterByPos;
    const unmatchedPos = filteredByPos && filteredDefinitions.length === 0;

    if (unmatchedPos) {
      this.logger.warn({
        message: 'no definitions match pos',
        event: 'vocabulary.no_definitions_match_pos',
        method: this.lookup.name,
        data: {
          word: input.word,
          mappedPos,
          availablePartsOfSpeech,
        },
      });
    }

    // Deck enrichment on filtered definitions
    const definitionIds = filteredDefinitions.map((d) => d.id);

    const cards = await this.cardsService.findCardsByDefinitionIdsAndUserId(
      definitionIds,
      input.userId,
    );

    this.logger.debug({
      message: 'deck enrichment',
      event: 'vocabulary.deck_enrichment',
      method: this.lookup.name,
      data: {
        definitionCount: filteredDefinitions.length,
        cardsFound: cards.length,
      },
    });

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

    this.logger.log({
      message: 'lookup complete',
      event: 'vocabulary.lookup_complete',
      method: this.lookup.name,
      data: {
        word: input.word,
        lemma: baseOutput.lemma,
        pos: mappedPos,
        filteredByPos,
        definitionCount: definitions.length,
        unmatchedPos,
      },
    });

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
