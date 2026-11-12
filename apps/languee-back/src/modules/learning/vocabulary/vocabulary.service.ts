import { Injectable, Logger } from '@nestjs/common';
import { LexicalKind } from '@prisma/client';
import { DictionaryService } from '../../lexicon/enrichment/dictionary/dictionary.service';
import { DefinitionsNotFoundException } from '../../lexicon/enrichment/dictionary/dictionary.errors';
import { CardsService } from '../cards/cards.service';
import { NlpService } from '../../lexicon/enrichment/nlp/nlp.service';
import { WordsService } from '../../lexicon/entries/words/words.service';
import { DefinitionService } from '../../lexicon/entries/definitions/definitions.service';
import { PartOfSpeech } from '../../lexicon/types/part-of-speech.enum';
import { PartOfSpeechRequiredError } from './vocabulary.errors';
import type {
  NlpExpressionAnalysis,
  NlpWordAnalysis,
} from '../../lexicon/enrichment/nlp/nlp.interfaces';
import type {
  CreateUserDefinitionInput,
  CreateUserDefinitionOutput,
} from './types/create-user-definition.types';
import type {
  DeckRef,
  LookupVocabularyInput,
  LookupVocabularyOutput,
} from './types/lookup-vocabulary.types';
import type { LookupWordOutput } from '../../lexicon/enrichment/dictionary/types/lookup-word.types';
import type { InflectionForms } from '../../lexicon/types/inflection-forms.types';
import type { SavedVocabularyCandidate } from '../cards/cards.service';
import type {
  SavedMatchDefinitionDto,
  SavedMatchesDto,
  SavedMatchesResponseDto,
} from './dto/saved-matches.dto';

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
      ...(input.selectionStart === undefined
        ? []
        : [{ start: input.selectionStart, end: input.selectionEnd! }]),
    );

    if (analysis.kind === 'word') {
      return this.lookupSingleWord(input, analysis);
    }

    return this.lookupExpression(input, analysis);
  }

  async savedMatches(
    input: SavedMatchesDto,
    userId: string,
  ): Promise<SavedMatchesResponseDto> {
    const candidates = await this.cardsService.findSavedVocabularyCandidates(
      userId,
      input.language,
      input.tokens,
    );
    const matched = new Map<
      string,
      Map<string, Map<string, SavedMatchDefinitionDto>>
    >();
    const lemmas = new Map<string, string>(
      candidates.map((candidate) => [candidate.word.id, candidate.word.lemma]),
    );
    for (const candidate of candidates)
      for (const surface of input.tokens)
        this.recordSavedMatch(matched, candidate, surface);
    return {
      matches: [...matched].map(([surface, headwords]) => ({
        surface,
        headwords: [...headwords].map(([wordId, definitions]) => ({
          wordId,
          lemma: lemmas.get(wordId) ?? '',
          definitions: [...definitions.values()],
        })),
      })),
    };
  }

  private recordSavedMatch(
    matched: Map<string, Map<string, Map<string, SavedMatchDefinitionDto>>>,
    candidate: SavedVocabularyCandidate,
    surface: string,
  ): void {
    const direct =
      candidate.word.lemma.normalize('NFC').toLocaleLowerCase('en-US') ===
      surface;
    const form = candidate.word.forms.some(
      (entry) =>
        entry.partOfSpeech === candidate.partOfSpeech &&
        entry.form.normalize('NFC').toLocaleLowerCase('en-US') === surface,
    );
    if (!direct && !form) return;
    const byHeadword =
      matched.get(surface) ??
      new Map<string, Map<string, SavedMatchDefinitionDto>>();
    const byDefinition =
      byHeadword.get(candidate.word.id) ??
      new Map<string, SavedMatchDefinitionDto>();
    byDefinition.set(candidate.definitionId, {
      definitionId: candidate.definitionId,
      partOfSpeech: candidate.partOfSpeech,
      definition: candidate.definition,
      decks: [
        ...new Map(candidate.decks.map((deck) => [deck.id, deck])).values(),
      ],
    });
    byHeadword.set(candidate.word.id, byDefinition);
    matched.set(surface, byHeadword);
  }

  private async lookupSingleWord(
    input: LookupVocabularyInput,
    analysis: NlpWordAnalysis,
  ): Promise<LookupVocabularyOutput> {
    const base = await this.dictionaryService.lookup({
      word: input.word,
      lemma: analysis.lemma,
      language: input.language,
      kind: LexicalKind.word,
      pos: analysis.pos ?? undefined,
    });
    const selected = base.headwords.find(
      (word) => word.wordId === base.preferred?.wordId,
    );
    const availablePartsOfSpeech =
      selected?.partsOfSpeech.map((group) => group.partOfSpeech) ?? [];
    const filteredByPos =
      Boolean(input.context?.trim()) &&
      !input.disablePosFiltering &&
      analysis.pos !== null;
    const unmatchedPos =
      filteredByPos &&
      !availablePartsOfSpeech.includes(analysis.pos as PartOfSpeech);
    const preferred = base.preferred && {
      ...base.preferred,
      partOfSpeech: filteredByPos && !unmatchedPos ? analysis.pos : null,
    };
    return {
      ...base,
      context: input.context,
      preferred,
      headwords: await this.enrichHeadwords(base, input.userId),
      meta: {
        analyzedLemma: analysis.lemma,
        analyzedPos: analysis.pos,
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
    const { base, providerMiss } = await this.findExpression(input, analysis);
    const matchedText = analysis.contextMatch?.matchedText;
    const contextInflections: InflectionForms | null =
      analysis.contextMatch?.found === true &&
      typeof matchedText === 'string' &&
      matchedText.trim().toLowerCase() !== analysis.canonical
        ? { type: 'expression', contextForm: matchedText.trim() }
        : null;
    const selected = base.headwords.find(
      (word) => word.wordId === base.preferred?.wordId,
    );
    return {
      ...base,
      input: input.word,
      context: input.context,
      headwords: await this.enrichHeadwords(
        base,
        input.userId,
        contextInflections,
      ),
      meta: {
        analyzedLemma: analysis.canonical,
        analyzedPos: null,
        filteredByPos: false,
        unmatchedPos: false,
        availablePartsOfSpeech:
          selected?.partsOfSpeech.map((group) => group.partOfSpeech) ?? [],
        isExpression: true,
        providerMiss,
        expressionContextFound: input.context?.trim()
          ? (analysis.contextMatch?.found ?? null)
          : null,
      },
    };
  }

  private async findExpression(
    input: LookupVocabularyInput,
    analysis: NlpExpressionAnalysis,
  ) {
    const kind =
      analysis.kind === 'phrasal_verb'
        ? LexicalKind.phrasal_verb
        : LexicalKind.expression;
    try {
      const base = await this.dictionaryService.lookup({
        word: input.word.trim(),
        lemma: analysis.canonical,
        language: input.language,
        kind,
      });
      return { base, providerMiss: false };
    } catch (error: unknown) {
      if (!(error instanceof DefinitionsNotFoundException)) throw error;
      const base: LookupWordOutput = {
        input: input.word,
        language: input.language,
        kind,
        source: 'provider',
        preferred: null,
        headwords: [],
      };
      return { base, providerMiss: true };
    }
  }

  private async enrichHeadwords(
    base: LookupWordOutput,
    userId: string,
    contextInflections: InflectionForms | null = null,
  ): Promise<LookupVocabularyOutput['headwords']> {
    const definitions = base.headwords.flatMap((word) =>
      word.partsOfSpeech.flatMap((group) => group.definitions),
    );
    const cards = await this.cardsService.findCardsByDefinitionIdsAndUserId(
      definitions.map((d) => d.id),
      userId,
    );
    const decks = new Map<string, DeckRef[]>();
    for (const card of cards) {
      const entries = decks.get(card.definitionId) ?? [];
      entries.push({ id: card.deck.id, name: card.deck.name });
      decks.set(card.definitionId, entries);
    }
    return base.headwords.map((word) => ({
      ...word,
      partsOfSpeech: word.partsOfSpeech.map((group) => ({
        ...group,
        definitions: group.definitions.map((definition) => ({
          ...definition,
          inflectionForms: definition.inflectionForms ?? contextInflections,
          decks: decks.get(definition.id) ?? [],
        })),
      })),
    }));
  }

  async createUserDefinition(
    input: CreateUserDefinitionInput,
  ): Promise<CreateUserDefinitionOutput> {
    // NLP owns the word-vs-expression classification, exactly as in lookup().
    // The caller supplies only the text; the kind and canonical form come from
    // the analysis, never from the request.
    const analysis = await this.nlpService.analyze(
      input.text,
      undefined,
      input.language,
    );

    const { canonical, effectiveKind, partOfSpeech } =
      this.classifyUserDefinition(input, analysis);

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

    this.logCreatedDefinition(word.id, canonical, effectiveKind, partOfSpeech);

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
  private logCreatedDefinition(
    wordId: string,
    canonical: string,
    effectiveKind: LexicalKind,
    partOfSpeech: PartOfSpeech,
  ): void {
    this.logger.log({
      message: 'user definition created',
      event: 'vocabulary.user_definition_created',
      method: this.createUserDefinition.name,
      data: {
        wordId,
        lemma: canonical,
        kind: effectiveKind,
        partOfSpeech,
      },
    });
  }

  private classifyUserDefinition(
    input: CreateUserDefinitionInput,
    analysis: Awaited<ReturnType<NlpService['analyze']>>,
  ) {
    let canonical: string;
    let effectiveKind: LexicalKind;
    let partOfSpeech: PartOfSpeech;

    if (analysis.kind === 'word') {
      // A single word still needs a part of speech: the dictionary provider that
      // would normally supply one has already missed, so the caller must give it.
      if (!input.partOfSpeech) {
        throw new PartOfSpeechRequiredError();
      }
      canonical = analysis.lemma;
      effectiveKind = LexicalKind.word;
      partOfSpeech = input.partOfSpeech;
    } else {
      canonical = analysis.canonical;
      effectiveKind =
        analysis.kind === 'phrasal_verb'
          ? LexicalKind.phrasal_verb
          : LexicalKind.expression;
      partOfSpeech = input.partOfSpeech ?? PartOfSpeech.PHRASE;
    }

    return { canonical, effectiveKind, partOfSpeech };
  }
}
