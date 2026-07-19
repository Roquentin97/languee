import { Injectable, Logger } from '@nestjs/common';
import { LexicalKind } from '@prisma/client';
import { DictionaryService } from '../dictionary/dictionary.service';
import { DefinitionsNotFoundException } from '../dictionary/dictionary.errors';
import { CardsService } from '../cards/cards.service';
import { NlpService } from '../nlp/nlp.service';
import { WordsService } from '../words/words.service';
import { DefinitionService } from '../definitions/definitions.service';
import { PartOfSpeech } from './enums/part-of-speech.enum';
import {
  PartOfSpeechRequiredError,
  TextMustBeExpressionError,
  TextMustBeSingleWordError,
} from './vocabulary.errors';
import type {
  NlpExpressionAnalysis,
  NlpWordAnalysis,
} from '../nlp/nlp.interfaces';
import type {
  CreateUserDefinitionInput,
  CreateUserDefinitionOutput,
} from './types/create-user-definition.types';
import type {
  DeckRef,
  EnrichedDefinitionResult,
  LookupVocabularyInput,
  LookupVocabularyKind,
  LookupVocabularyOutput,
} from './types/lookup-vocabulary.types';
import type { LookupWordOutput } from '../dictionary/types/lookup-word.types';
import type { InflectionForms } from '../dictionary/types/inflection-forms.types';

const USER_DEFINITION_PROVIDER = 'user';

@Injectable()
export class VocabularyService {
  private readonly logger = new Logger(VocabularyService.name);

  constructor(
    private readonly dictionaryService: DictionaryService,
    private readonly cardsService: CardsService,
    private readonly nlpService: NlpService,
    private readonly wordsService: WordsService,
    private readonly definitionService: DefinitionService,
  ) {}

  async lookup(input: LookupVocabularyInput): Promise<LookupVocabularyOutput> {
    // NLP owns the word-vs-expression decision: it tokenizes with the actual
    // language model and returns a discriminated result.
    const analysis = await this.nlpService.analyze(
      input.word,
      input.context,
      input.language,
    );

    if (analysis.kind === 'word') {
      return this.lookupSingleWord(input, analysis);
    }

    return this.lookupExpression(input, analysis);
  }

  private async lookupSingleWord(
    input: LookupVocabularyInput,
    nlpResult: NlpWordAnalysis,
  ): Promise<LookupVocabularyOutput> {
    this.logger.debug({
      message: 'nlp result',
      event: 'vocabulary.nlp_result',
      method: this.lookupSingleWord.name,
      data: {
        word: input.word,
        lemma: nlpResult.lemma,
        pos: nlpResult.pos,
        isIrregular: nlpResult.isIrregular,
      },
    });

    // Non-English languages (Spanish, German, ...) carry their inflected
    // forms in extraForms (keyed by form name) rather than the English
    // lemminflect-derived inflectionForms shape. `type` is the language code
    // itself so masking/answer-matching can treat every non-`type` key as an
    // accepted form regardless of its name — no per-language branching.
    const inflectionForms: InflectionForms | null = nlpResult.extraForms
      ? ({
          type: input.language as 'es' | 'de',
          ...nlpResult.extraForms,
        } as InflectionForms)
      : nlpResult.inflectionForms;

    const baseOutput = await this.dictionaryService.lookup({
      word: input.word,
      lemma: nlpResult.lemma,
      language: input.language,
      kind: LexicalKind.word,
      pos: nlpResult.pos ?? undefined,
      isIrregular: nlpResult.isIrregular,
      inflectionForms,
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
      method: this.lookupSingleWord.name,
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
        method: this.lookupSingleWord.name,
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
      method: this.lookupSingleWord.name,
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
      method: this.lookupSingleWord.name,
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
      language: input.language,
      kind: 'word',
      partOfSpeech: mappedPos,
      definitions,
      meta: {
        filteredByPos,
        unmatchedPos,
        availablePartsOfSpeech,
        isExpression: false,
        providerMiss: false,
        expressionContextFound: null,
      },
    };
  }

  private async lookupExpression(
    input: LookupVocabularyInput,
    analysis: NlpExpressionAnalysis,
  ): Promise<LookupVocabularyOutput> {
    const trimmedWord = input.word.trim();

    this.logger.debug({
      message: 'nlp expression result',
      event: 'vocabulary.nlp_expression_result',
      method: this.lookupExpression.name,
      data: {
        word: trimmedWord,
        canonical: analysis.canonical,
        kind: analysis.kind,
      },
    });

    const kind: LookupVocabularyKind = analysis.kind;
    const dictionaryKind =
      analysis.kind === 'phrasal_verb'
        ? LexicalKind.phrasal_verb
        : LexicalKind.expression;

    let baseOutput: LookupWordOutput;
    let providerMiss = false;
    try {
      baseOutput = await this.dictionaryService.lookup({
        word: trimmedWord,
        lemma: analysis.canonical,
        language: input.language,
        kind: dictionaryKind,
      });
    } catch (err: unknown) {
      if (err instanceof DefinitionsNotFoundException) {
        providerMiss = true;
        baseOutput = {
          lemma: analysis.canonical,
          source: 'provider',
          definitions: [],
        };
        this.logger.warn({
          message: 'expression provider miss',
          event: 'vocabulary.expression_provider_miss',
          method: this.lookupExpression.name,
          data: { word: trimmedWord, lemma: analysis.canonical },
        });
      } else {
        throw err;
      }
    }

    const availablePartsOfSpeech: PartOfSpeech[] = [
      ...new Set(baseOutput.definitions.map((d) => d.partOfSpeech)),
    ];

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

    const hasContext = Boolean(input.context?.trim());
    const expressionContextFound = hasContext
      ? (analysis.contextMatch?.found ?? null)
      : null;

    // Carry the inflected surface form found in the context (e.g. "ran into"
    // for canonical "run into") so cards created from this lookup can mask it
    // in review prompts and accept it as a typed answer.
    const matchedText = analysis.contextMatch?.matchedText;
    const contextInflections: InflectionForms | null =
      analysis.contextMatch?.found === true &&
      typeof matchedText === 'string' &&
      matchedText.trim().toLowerCase() !== analysis.canonical
        ? { type: 'expression', contextForm: matchedText.trim() }
        : null;

    const definitions: EnrichedDefinitionResult[] = baseOutput.definitions.map(
      (def) => ({
        id: def.id,
        partOfSpeech: def.partOfSpeech,
        definition: def.definition,
        example: def.example,
        provider: def.provider,
        hasIrregularForms: def.hasIrregularForms,
        inflectionForms: def.inflectionForms ?? contextInflections,
        decks: decksByDefinition.get(def.id) ?? [],
      }),
    );

    this.logger.log({
      message: 'expression lookup complete',
      event: 'vocabulary.expression_lookup_complete',
      method: this.lookupExpression.name,
      data: {
        word: trimmedWord,
        lemma: analysis.canonical,
        kind,
        definitionCount: definitions.length,
        providerMiss,
      },
    });

    return {
      input: input.word,
      context: input.context,
      lemma: analysis.canonical,
      language: input.language,
      kind,
      partOfSpeech: null,
      definitions,
      meta: {
        filteredByPos: false,
        unmatchedPos: false,
        availablePartsOfSpeech,
        isExpression: true,
        providerMiss,
        expressionContextFound,
      },
    };
  }

  async createUserDefinition(
    input: CreateUserDefinitionInput,
  ): Promise<CreateUserDefinitionOutput> {
    const tokens = input.text.trim().split(/\s+/).filter(Boolean);

    let canonical: string;
    let effectiveKind: LexicalKind;
    let partOfSpeech: PartOfSpeech;

    if (input.kind === 'word') {
      if (tokens.length !== 1) {
        throw new TextMustBeSingleWordError();
      }
      if (!input.partOfSpeech) {
        throw new PartOfSpeechRequiredError();
      }
      canonical = this.wordsService.canonicalise(input.text);
      effectiveKind = LexicalKind.word;
      partOfSpeech = input.partOfSpeech;
    } else {
      if (tokens.length < 2 || tokens.length > 6) {
        throw new TextMustBeExpressionError();
      }
      const analysis = await this.nlpService.analyze(
        input.text,
        undefined,
        input.language,
      );
      if (analysis.kind === 'word') {
        throw new TextMustBeExpressionError();
      }
      canonical = analysis.canonical;
      effectiveKind =
        analysis.kind === 'phrasal_verb'
          ? LexicalKind.phrasal_verb
          : LexicalKind.expression;
      partOfSpeech = input.partOfSpeech ?? PartOfSpeech.PHRASE;
    }

    const word = await this.wordsService.ensureExistsAndReturn(
      canonical,
      input.language,
      effectiveKind,
    );

    const row = await this.definitionService.createOne(
      word.id,
      {
        partOfSpeech,
        definition: input.definition,
        ...(input.example !== undefined ? { example: input.example } : {}),
      },
      USER_DEFINITION_PROVIDER,
    );

    this.logger.log({
      message: 'user definition created',
      event: 'vocabulary.user_definition_created',
      method: this.createUserDefinition.name,
      data: {
        wordId: word.id,
        lemma: canonical,
        kind: effectiveKind,
        partOfSpeech,
      },
    });

    return {
      id: row.id,
      wordId: word.id,
      lemma: canonical,
      kind: effectiveKind,
      partOfSpeech: row.partOfSpeech as PartOfSpeech,
      definition: row.definition,
      example: row.example ?? null,
      provider: row.provider,
    };
  }
}
