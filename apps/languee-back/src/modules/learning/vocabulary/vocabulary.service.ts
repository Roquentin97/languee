import { Injectable, Logger, Optional } from '@nestjs/common';
import { LexicalEntryKind } from '@prisma/client';
import { DictionaryService } from '../../lexicon/enrichment/dictionary/dictionary.service';
import { DefinitionsNotFoundException } from '../../lexicon/enrichment/dictionary/dictionary.errors';
import { CardsService } from '../cards/cards.service';
import { NlpService } from '../../lexicon/enrichment/nlp/nlp.service';
import { LexicalEntriesService } from '../../lexicon/entries/lexical-entries/lexical-entries.service';
import { DefinitionService } from '../../lexicon/entries/definitions/definitions.service';
import { PartOfSpeech } from '../../lexicon/types/part-of-speech.enum';
import { PartOfSpeechRequiredError } from './vocabulary.errors';
import { rankLexicalGroups } from './lexical-ranking';
import { LexicalEvaluationService } from '../../evaluation/lexical/lexical-evaluation.service';
import { v7 as uuidv7 } from 'uuid';
import { normalizeSpelling } from '../../lexicon/enrichment/morphology/morphology-provider';
import {
  rangesCoverCompleteWords,
  rangesReconstructText,
} from '../capture/capture-ranges';
import type {
  NlpExpressionAnalysis,
  NlpExpressionMatch,
  NlpWordAnalysis,
} from '../../lexicon/enrichment/nlp/nlp.interfaces';
import type {
  CreateUserDefinitionInput,
  CreateUserDefinitionOutput,
} from './types/create-user-definition.types';
import type {
  DeckRef,
  LookupAlternative,
  LookupVocabularyInput,
  LookupVocabularyOutput,
} from './types/lookup-vocabulary.types';
import type { LookupEntryOutput } from '../../lexicon/enrichment/dictionary/types/lookup-entry.types';
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
    private readonly wordsService: LexicalEntriesService,
    private readonly definitionService: DefinitionService,
    @Optional() private readonly evaluation?: LexicalEvaluationService,
  ) {}

  async lookup(input: LookupVocabularyInput): Promise<LookupVocabularyOutput> {
    // NLP owns the word-vs-expression decision: it tokenizes with the actual
    // language model and returns a discriminated result.
    const analysis = await this.nlpService.analyze(
      input.text,
      input.context,
      input.language,
      input.selectionRanges,
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
      candidates.map((candidate) => [
        candidate.entry.id,
        candidate.entry.lemma,
      ]),
    );
    for (const candidate of candidates)
      for (const surface of input.tokens)
        this.recordSavedMatch(matched, candidate, surface);
    return {
      matches: [...matched].map(([surface, headwords]) => ({
        surface,
        headwords: [...headwords].map(([entryId, definitions]) => ({
          entryId,
          lemma: lemmas.get(entryId) ?? '',
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
      candidate.entry.lemma.normalize('NFC').toLocaleLowerCase('en-US') ===
      surface;
    const form = candidate.entry.forms.some(
      (entry) =>
        entry.partOfSpeech === candidate.partOfSpeech &&
        entry.form.normalize('NFC').toLocaleLowerCase('en-US') === surface,
    );
    if (!direct && !form) return;
    const byHeadword =
      matched.get(surface) ??
      new Map<string, Map<string, SavedMatchDefinitionDto>>();
    const byDefinition =
      byHeadword.get(candidate.entry.id) ??
      new Map<string, SavedMatchDefinitionDto>();
    byDefinition.set(candidate.definitionId, {
      definitionId: candidate.definitionId,
      partOfSpeech: candidate.partOfSpeech,
      definition: candidate.definition,
      decks: [
        ...new Map(candidate.decks.map((deck) => [deck.id, deck])).values(),
      ],
    });
    byHeadword.set(candidate.entry.id, byDefinition);
    matched.set(surface, byHeadword);
  }

  private async lookupSingleWord(
    input: LookupVocabularyInput,
    analysis: NlpWordAnalysis,
  ): Promise<LookupVocabularyOutput> {
    const lookupId = uuidv7();
    const { base, providerMiss, providerError } = await this.lookupWordBase(
      input,
      analysis,
    );
    const availablePartsOfSpeech = this.availablePartsOfSpeech(base);
    const filteredByPos =
      Boolean(input.context?.trim()) &&
      !input.disablePosFiltering &&
      analysis.pos !== null;
    const unmatchedPos =
      filteredByPos &&
      !availablePartsOfSpeech.includes(analysis.pos as PartOfSpeech);
    const ranked = rankLexicalGroups(
      base.headwords,
      analysis.lemma,
      analysis.pos,
      filteredByPos,
    );
    this.evaluation?.scheduleLookup(lookupId, input, analysis, base, ranked);
    const alternatives = await this.wordAlternatives(
      input,
      analysis,
      providerMiss,
      providerError,
    );
    return {
      ...base,
      context: input.context,
      preferred: this.preferredPair(ranked.preferred),
      lookupId,
      orderedGroups: ranked.groups.map(({ entryId, partOfSpeech }) => ({
        entryId,
        partOfSpeech,
      })),
      headwords: await this.enrichHeadwords(base, input.userId),
      alternatives,
      meta: this.wordLookupMeta(
        analysis,
        filteredByPos,
        unmatchedPos,
        availablePartsOfSpeech,
        providerMiss,
      ),
    };
  }

  private async wordAlternatives(
    input: LookupVocabularyInput,
    analysis: NlpWordAnalysis,
    providerMiss: boolean,
    providerError: DefinitionsNotFoundException | null,
  ): Promise<LookupAlternative[]> {
    const alternatives =
      input.includeSuggestions === false
        ? []
        : await this.contextExpressionAlternative(input, analysis);
    if (providerMiss && alternatives.length === 0)
      throw (
        providerError ??
        new DefinitionsNotFoundException(input.text, input.language)
      );
    return alternatives;
  }

  private wordLookupMeta(
    analysis: NlpWordAnalysis,
    filteredByPos: boolean,
    unmatchedPos: boolean,
    availablePartsOfSpeech: PartOfSpeech[],
    providerMiss: boolean,
  ): LookupVocabularyOutput['meta'] {
    return {
      analyzedLemma: analysis.lemma,
      analyzedPos: analysis.pos,
      filteredByPos,
      unmatchedPos,
      availablePartsOfSpeech,
      isExpression: false,
      providerMiss,
      expressionContextFound: null,
    };
  }

  private preferredPair(
    group: ReturnType<typeof rankLexicalGroups>['preferred'],
  ) {
    return group
      ? { entryId: group.entryId, partOfSpeech: group.partOfSpeech }
      : null;
  }

  private async lookupWordBase(
    input: LookupVocabularyInput,
    analysis: NlpWordAnalysis,
  ): Promise<{
    base: LookupEntryOutput;
    providerMiss: boolean;
    providerError: DefinitionsNotFoundException | null;
  }> {
    try {
      const base = await this.dictionaryService.lookup({
        text: input.text,
        lemma: analysis.lemma,
        language: input.language,
        kind: LexicalEntryKind.word,
        pos: analysis.pos ?? undefined,
      });
      return { base, providerMiss: false, providerError: null };
    } catch (error: unknown) {
      if (error instanceof DefinitionsNotFoundException) {
        const empty: LookupEntryOutput = {
          input: input.text,
          language: input.language,
          kind: LexicalEntryKind.word,
          source: 'provider',
          preferred: null,
          headwords: [],
        };
        return { base: empty, providerMiss: true, providerError: error };
      }
      throw error;
    }
  }

  private async contextExpressionAlternative(
    input: LookupVocabularyInput,
    analysis: NlpWordAnalysis,
  ): Promise<LookupAlternative[]> {
    const selection = analysis.selectionAnalysis;
    if (
      !input.context ||
      !input.selectionRanges?.length ||
      selection?.pos !== 'VERB' ||
      !rangesCoverCompleteWords(input.context, [selection.headRange])
    )
      return [];

    try {
      const best = await this.findBestContextExpressionMatch(
        input,
        selection.headLemma,
        selection.headRange,
      );
      if (!best) return [];
      return [
        {
          type: 'expression',
          text: best.surface_text,
          lemma: best.canonical_text,
          entryId: best.entry_id,
          selectionRanges: best.component_ranges,
          reason: 'context_match',
          prominence: 'normal',
        },
      ];
    } catch {
      this.logger.debug({
        message: 'optional expression matching failed',
        event: 'vocabulary.expression_matching_unavailable',
        method: this.contextExpressionAlternative.name,
        data: { language: input.language, headLemma: selection.headLemma },
      });
      return [];
    }
  }

  private async findBestContextExpressionMatch(
    input: LookupVocabularyInput,
    headLemma: string,
    headRange: NonNullable<NlpWordAnalysis['selectionAnalysis']>['headRange'],
  ): Promise<NlpExpressionMatch | null> {
    const candidates = await this.wordsService.findExpressionCandidates(
      headLemma,
      input.language,
    );
    if (!candidates.length || !input.context) return null;
    const matches = await this.nlpService.matchExpressions({
      language: input.language,
      input_text: input.context,
      selected_verb_range: headRange,
      candidates: candidates.map(({ id, lemma }) => ({
        entry_id: id,
        canonical_text: lemma,
      })),
    });
    const candidateById = new Map(
      candidates.map((candidate) => [candidate.id, candidate]),
    );
    return (
      matches.find((match) =>
        this.isUsableExpressionMatch(match, candidateById, input, headRange),
      ) ?? null
    );
  }

  private isUsableExpressionMatch(
    match: NlpExpressionMatch,
    candidateById: Map<string, { id: string; lemma: string }>,
    input: LookupVocabularyInput,
    headRange: NonNullable<NlpWordAnalysis['selectionAnalysis']>['headRange'],
  ): boolean {
    const candidate = candidateById.get(match.entry_id);
    const firstComponent = match.component_ranges[0];
    return Boolean(
      candidate &&
      candidate.lemma === match.canonical_text &&
      firstComponent !== undefined &&
      firstComponent.start === headRange.start &&
      firstComponent.end === headRange.end &&
      rangesReconstructText(
        input.context,
        match.surface_text,
        match.component_ranges,
      ) &&
      !this.alternativeReproducesTarget(
        input,
        match.surface_text,
        match.component_ranges,
      ),
    );
  }

  private alternativeReproducesTarget(
    input: LookupVocabularyInput,
    text: string,
    ranges: LookupAlternative['selectionRanges'],
  ): boolean {
    return (
      normalizeSpelling(text) === normalizeSpelling(input.text) &&
      JSON.stringify(ranges) === JSON.stringify(input.selectionRanges ?? [])
    );
  }

  private availablePartsOfSpeech(base: LookupEntryOutput): PartOfSpeech[] {
    return [
      ...new Set(
        base.headwords.flatMap((word) =>
          word.partsOfSpeech.map((group) => group.partOfSpeech),
        ),
      ),
    ];
  }

  private async lookupExpression(
    input: LookupVocabularyInput,
    analysis: NlpExpressionAnalysis,
  ): Promise<LookupVocabularyOutput> {
    const { base, providerMiss } = await this.findExpression(input, analysis);
    const lookupId = uuidv7();
    this.evaluation?.scheduleExpressionLookup(lookupId, input, analysis, base);
    return {
      ...base,
      input: input.text,
      context: input.context,
      lookupId,
      headwords: await this.enrichHeadwords(
        base,
        input.userId,
        this.expressionContextInflections(analysis),
      ),
      alternatives:
        input.includeSuggestions === false
          ? []
          : await this.baseVerbAlternative(input, analysis, providerMiss),
      meta: this.expressionMeta(input, analysis, base, providerMiss),
    };
  }

  private expressionContextInflections(
    analysis: NlpExpressionAnalysis,
  ): InflectionForms | null {
    const matchedText = analysis.contextMatch?.matchedText;
    return analysis.contextMatch?.found === true &&
      typeof matchedText === 'string' &&
      matchedText.trim().toLowerCase() !== analysis.canonical
      ? { type: 'expression', contextForm: matchedText.trim() }
      : null;
  }

  private expressionMeta(
    input: LookupVocabularyInput,
    analysis: NlpExpressionAnalysis,
    base: LookupEntryOutput,
    providerMiss: boolean,
  ): LookupVocabularyOutput['meta'] {
    const selected = base.headwords.find(
      (word) => word.entryId === base.preferred?.entryId,
    );
    return {
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
    };
  }

  private async baseVerbAlternative(
    input: LookupVocabularyInput,
    analysis: NlpExpressionAnalysis,
    providerMiss: boolean,
  ): Promise<LookupAlternative[]> {
    const selection = analysis.selectionAnalysis;
    if (
      !input.context ||
      !input.selectionRanges?.length ||
      selection?.pos !== 'VERB' ||
      !rangesCoverCompleteWords(input.context, [selection.headRange])
    )
      return [];

    const text = Array.from(input.context)
      .slice(selection.headRange.start, selection.headRange.end)
      .join('');
    if (this.alternativeReproducesTarget(input, text, [selection.headRange]))
      return [];

    let entryId: string | null = null;
    try {
      const entry = await this.wordsService.findByLemma(
        normalizeSpelling(selection.headLemma),
        input.language,
      );
      entryId = entry?.id ?? null;
    } catch {
      // The cached id only improves the alternative's metadata.
    }
    return [
      {
        type: 'base_verb',
        text,
        lemma: selection.headLemma,
        entryId,
        selectionRanges: [selection.headRange],
        reason: providerMiss ? 'expression_not_found' : 'verb_alternative',
        prominence: providerMiss ? 'normal' : 'subtle',
      },
    ];
  }

  private async findExpression(
    input: LookupVocabularyInput,
    analysis: NlpExpressionAnalysis,
  ) {
    const kind =
      analysis.kind === 'phrasal_verb'
        ? LexicalEntryKind.phrasal_verb
        : LexicalEntryKind.expression;
    try {
      const base = await this.dictionaryService.lookup({
        text: input.text.trim(),
        lemma: analysis.canonical,
        language: input.language,
        kind,
      });
      return { base, providerMiss: false };
    } catch (error: unknown) {
      if (!(error instanceof DefinitionsNotFoundException)) throw error;
      const base: LookupEntryOutput = {
        input: input.text,
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
    base: LookupEntryOutput,
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
      entryId: word.id,
      lemma: canonical,
      kind: effectiveKind,
      partOfSpeech: row.partOfSpeech as PartOfSpeech,
      definition: row.definition,
      example: row.example ?? null,
      provider: row.provider,
    };
  }
  private logCreatedDefinition(
    entryId: string,
    canonical: string,
    effectiveKind: LexicalEntryKind,
    partOfSpeech: PartOfSpeech,
  ): void {
    this.logger.log({
      message: 'user definition created',
      event: 'vocabulary.user_definition_created',
      method: this.createUserDefinition.name,
      data: {
        entryId,
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
    let effectiveKind: LexicalEntryKind;
    let partOfSpeech: PartOfSpeech;

    if (analysis.kind === 'word') {
      // A single word still needs a part of speech: the dictionary provider that
      // would normally supply one has already missed, so the caller must give it.
      if (!input.partOfSpeech) {
        throw new PartOfSpeechRequiredError();
      }
      canonical = analysis.lemma;
      effectiveKind = LexicalEntryKind.word;
      partOfSpeech = input.partOfSpeech;
    } else {
      canonical = analysis.canonical;
      effectiveKind =
        analysis.kind === 'phrasal_verb'
          ? LexicalEntryKind.phrasal_verb
          : LexicalEntryKind.expression;
      partOfSpeech = input.partOfSpeech ?? PartOfSpeech.PHRASE;
    }

    return { canonical, effectiveKind, partOfSpeech };
  }
}
