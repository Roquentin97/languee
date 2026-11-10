import { Inject, Injectable } from '@nestjs/common';
import { LexicalKind } from '@prisma/client';
import { PrismaService } from '../core/prisma/prisma.service';
import { WordsService } from '../words/words.service';
import { DefinitionService } from '../definitions/definitions.service';
import { PartOfSpeech } from '../vocabulary/enums/part-of-speech.enum';
import {
  MORPHOLOGY_PROVIDER,
  normalizeSpelling,
} from '../morphology/morphology-provider';
import type { MorphologyProvider } from '../morphology/morphology-provider';
import { MorphologyService } from '../morphology/morphology.service';
import { DICTIONARY_API_ADAPTER } from './dictionary.tokens';
import type {
  DictionaryReference,
  IDictionaryApiAdapter,
} from './interfaces/dictionary-api-adapter.interface';
import type { DefinitionResult } from './types/lookup-word.types';

export type ResolvedHeadword = {
  wordId: string;
  lemma: string;
  definitions: DefinitionResult[];
};
export type DiscoveryResult = {
  source: 'cache' | 'provider';
  headwords: ResolvedHeadword[];
};

@Injectable()
export class HeadwordDiscoveryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly words: WordsService,
    private readonly definitions: DefinitionService,
    @Inject(DICTIONARY_API_ADAPTER)
    private readonly dictionary: IDictionaryApiAdapter,
    @Inject(MORPHOLOGY_PROVIDER)
    private readonly morphologyProvider: MorphologyProvider,
    private readonly morphology: MorphologyService,
  ) {}

  async discover(
    surface: string,
    language: string,
    contextualLemma?: string,
    kind: LexicalKind = LexicalKind.word,
  ): Promise<DiscoveryResult> {
    const term = normalizeSpelling(surface);
    const key = { term_language: { term, language } };
    const state = await this.prisma.lookupState.findUnique({ where: key });
    if (state?.discoveryCompletedAt)
      return { source: 'cache', headwords: await this.resolve(term, language) };
    const visited = new Set<string>();
    await this.process(term, language, kind, visited);
    if (kind === LexicalKind.word) {
      const candidates = await this.morphologyProvider.findLemmaCandidates(
        term,
        language,
      );
      const reverse = await this.morphology.findOrigins(term, language);
      const knownWords = await this.words.findLookupCandidates(
        term,
        language,
        reverse.map((r) => r.wordId),
      );
      const lemmas = new Set([
        ...candidates.map((c) => c.lemma),
        ...knownWords.map((w) => w.lemma),
        ...(contextualLemma ? [contextualLemma] : []),
      ]);
      for (const lemma of lemmas)
        await this.process(lemma, language, kind, visited);
    }
    await this.prisma.lookupState.upsert({
      where: key,
      create: { term, language, discoveryCompletedAt: new Date() },
      update: { discoveryCompletedAt: new Date() },
    });
    return {
      source: 'provider',
      headwords: await this.resolve(term, language),
    };
  }

  private async process(
    spelling: string,
    language: string,
    kind: LexicalKind,
    visited: Set<string>,
  ): Promise<void> {
    const lemma = normalizeSpelling(spelling);
    if (visited.has(lemma)) return;
    visited.add(lemma);
    const where = { term_language: { term: lemma, language } };
    const cached = await this.prisma.lookupState.findUnique({ where });
    if (cached?.dictionaryFetchedAt) return;
    const entry = this.dictionary.fetchEntry
      ? await this.dictionary.fetchEntry(lemma, language)
      : {
          definitions: await this.dictionary.fetch(lemma, language),
          references: [],
        };
    if (entry.definitions.length)
      await this.persistDefinitions(lemma, language, kind, entry.definitions);
    await this.processReferences(
      entry.references,
      lemma,
      language,
      kind,
      visited,
    );
    await this.prisma.lookupState.upsert({
      where,
      create: { term: lemma, language, dictionaryFetchedAt: new Date() },
      update: { dictionaryFetchedAt: new Date() },
    });
  }

  private async processReferences(
    references: DictionaryReference[],
    lemma: string,
    language: string,
    kind: LexicalKind,
    visited: Set<string>,
  ): Promise<void> {
    for (const reference of references) {
      if (
        !['morphological_reference', 'alternative_spelling'].includes(
          reference.category,
        ) ||
        !reference.targetPos
      )
        continue;
      for (const target of reference.targets) {
        await this.process(target, language, kind, visited);
        // A cycle cannot validate a target from partially persisted definitions.
        const targetState = await this.prisma.lookupState.findUnique({
          where: {
            term_language: { term: normalizeSpelling(target), language },
          },
        });
        if (!targetState?.dictionaryFetchedAt) continue;
        const word = await this.words.findByLemma(
          normalizeSpelling(target),
          language,
        );
        if (!word) continue;
        const definitions = await this.definitions.findByWordId(word.id);
        if (
          !definitions.some(
            (d) =>
              d.partOfSpeech === String(reference.targetPos) &&
              d.provider === this.dictionary.providerName,
          )
        )
          continue;
        await this.morphology.recordValidatedRelationships(
          word.id,
          lemma,
          reference.targetPos,
          reference.relationTypes,
        );
      }
    }
  }

  private async persistDefinitions(
    lemma: string,
    language: string,
    kind: LexicalKind,
    definitions: Awaited<ReturnType<IDictionaryApiAdapter['fetch']>>,
  ): Promise<void> {
    const word = await this.words.ensureExistsAndReturn(lemma, language, kind);
    await this.definitions.createMany(
      word.id,
      definitions,
      this.dictionary.providerName,
    );
    for (const pos of new Set(definitions.map((d) => d.partOfSpeech))) {
      if (kind === LexicalKind.word) {
        await this.morphology.indexParadigm({
          wordId: word.id,
          lemma,
          partOfSpeech: pos,
          language,
        });
      }
    }
    if (!word.ipa && this.dictionary.fetchIpa) {
      try {
        const ipa = await this.dictionary.fetchIpa(lemma, language);
        if (ipa) await this.words.setIpaIfMissing(word.id, ipa);
      } catch {
        /* Pronunciation is optional enrichment. */
      }
    }
  }

  private groupDefinitions(
    definitions: Awaited<ReturnType<DefinitionService['findByWordIds']>>,
  ) {
    const byWord = new Map<string, typeof definitions>();
    for (const definition of definitions) {
      const rows = byWord.get(definition.wordId) ?? [];
      rows.push(definition);
      byWord.set(definition.wordId, rows);
    }
    return byWord;
  }

  private async describeWords(
    words: Awaited<ReturnType<WordsService['findLookupCandidates']>>,
    byWord: ReturnType<HeadwordDiscoveryService['groupDefinitions']>,
  ) {
    return this.morphology.describeEntries(
      words.flatMap((word) =>
        (byWord.get(word.id) ?? []).map((d) => ({
          wordId: word.id,
          lemma: word.lemma,
          partOfSpeech: d.partOfSpeech,
        })),
      ),
    );
  }

  private async resolve(
    term: string,
    language: string,
  ): Promise<ResolvedHeadword[]> {
    const origins = await this.morphology.findOrigins(term, language);
    const words = await this.words.findLookupCandidates(
      term,
      language,
      origins.map((o) => o.wordId),
    );
    const definitions = await this.definitions.findByWordIds(
      words.map((w) => w.id),
    );
    const byWord = this.groupDefinitions(definitions);
    const paradigms = await this.describeWords(words, byWord);
    return words
      .map((word) => {
        const allowed = new Set(
          origins
            .filter((o) => o.wordId === word.id)
            .map((o) => o.partOfSpeech),
        );
        return {
          wordId: word.id,
          lemma: word.lemma,
          definitions: (byWord.get(word.id) ?? [])
            .filter((d) => word.lemma === term || allowed.has(d.partOfSpeech))
            .map((d) => {
              const paradigm = paradigms.get(word.id)?.get(d.partOfSpeech);
              return {
                id: d.id,
                partOfSpeech: d.partOfSpeech as PartOfSpeech,
                definition: d.definition,
                example: d.example,
                provider: d.provider,
                inflectionForms: paradigm?.inflectionForms ?? null,
                hasIrregularForms: paradigm?.hasIrregularForms ?? false,
              };
            }),
        };
      })
      .filter((w) => w.definitions.length > 0);
  }
}
