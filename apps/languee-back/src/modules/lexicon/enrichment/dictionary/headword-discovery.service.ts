import { Inject, Injectable } from '@nestjs/common';
import { LexicalKind } from '@prisma/client';
import { PrismaService } from '../../../system/core/prisma/prisma.service';
import { WordsService } from '../../entries/words/words.service';
import { DefinitionService } from '../../entries/definitions/definitions.service';
import { PartOfSpeech } from '../../types/part-of-speech.enum';
import {
  MORPHOLOGY_PROVIDER,
  normalizeSpelling,
} from '../morphology/morphology-provider';
import type { MorphologyProvider } from '../morphology/morphology-provider';
import { MorphologyService } from '../morphology/morphology.service';
import { DICTIONARY_API_ADAPTER } from './dictionary.tokens';
import type {
  DictionaryEntry,
  IDictionaryApiAdapter,
} from './interfaces/dictionary-api-adapter.interface';
import type { DefinitionResult } from './types/lookup-word.types';

export type ResolvedHeadword = {
  wordId: string;
  lemma: string;
  relations: { partOfSpeech: string; relationType: string }[];
  definitions: DefinitionResult[];
};
export type DiscoveryResult = {
  source: 'cache' | 'provider';
  headwords: ResolvedHeadword[];
};

const waiting: (() => void)[] = [];
let active = 0;
const entriesInFlight = new WeakMap<
  IDictionaryApiAdapter,
  Map<string, Promise<DictionaryEntry>>
>();

async function limited<T>(operation: () => Promise<T>): Promise<T> {
  if (active >= 4) await new Promise<void>((resolve) => waiting.push(resolve));
  else active++;
  try {
    return await operation();
  } finally {
    const next = waiting.shift();
    if (next) next();
    else active--;
  }
}

@Injectable()
export class HeadwordDiscoveryService {
  private readonly discoveries = new Map<string, Promise<DiscoveryResult>>();
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
    const flightKey = JSON.stringify([
      term,
      language,
      contextualLemma ? normalizeSpelling(contextualLemma) : null,
      kind,
    ]);
    const existing = this.discoveries.get(flightKey);
    if (existing) return existing;
    const work = this.discoverInternal(term, language, contextualLemma, kind);
    this.discoveries.set(flightKey, work);
    void work.then(
      () => this.discoveries.delete(flightKey),
      () => this.discoveries.delete(flightKey),
    );
    return work;
  }

  private async discoverInternal(
    term: string,
    language: string,
    contextualLemma: string | undefined,
    kind: LexicalKind,
  ): Promise<DiscoveryResult> {
    const key = { term_language: { term, language } };
    const state = await this.prisma.lookupState.findUnique({ where: key });
    if (state?.discoveryCompletedAt) {
      if (kind === LexicalKind.word && contextualLemma)
        await this.processCohort([contextualLemma], language, kind);
      return { source: 'cache', headwords: await this.resolve(term, language) };
    }
    const seeds = [term];
    if (kind === LexicalKind.word) {
      let candidates: Awaited<
        ReturnType<MorphologyProvider['findLemmaCandidates']>
      >;
      try {
        candidates = await this.morphologyProvider.findLemmaCandidates(
          term,
          language,
        );
      } catch (error: unknown) {
        await this.processCohort([term], language, kind);
        throw error;
      }
      const reverse = await this.morphology.findOrigins(term, language);
      const knownWords = await this.words.findLookupCandidates(
        term,
        language,
        reverse.map((r) => r.wordId),
      );
      seeds.push(
        ...candidates.map((c) => c.lemma),
        ...knownWords.map((w) => w.lemma),
      );
      if (contextualLemma) seeds.push(contextualLemma);
    }
    if (seeds.length) await this.processCohort(seeds, language, kind);
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

  private async fetchEntry(
    lemma: string,
    language: string,
  ): Promise<DictionaryEntry> {
    const key = JSON.stringify([language, lemma]);
    let providerEntries = entriesInFlight.get(this.dictionary);
    if (!providerEntries) {
      providerEntries = new Map();
      entriesInFlight.set(this.dictionary, providerEntries);
    }
    const existing = providerEntries.get(key);
    if (existing) return existing;
    const work = limited(async () =>
      this.dictionary.fetchEntry
        ? this.dictionary.fetchEntry(lemma, language)
        : {
            definitions: await this.dictionary.fetch(lemma, language),
            references: [],
          },
    );
    providerEntries.set(key, work);
    const activeEntries = providerEntries;
    void work.then(
      () => activeEntries.delete(key),
      () => activeEntries.delete(key),
    );
    return work;
  }

  private async processCohort(
    seeds: string[],
    language: string,
    kind: LexicalKind,
  ): Promise<void> {
    const visited = new Set<string>();
    const fetched = new Map<string, DictionaryEntry>();
    const failures = new Map<string, unknown>();
    let pending = seeds;
    while (pending.length) {
      const batch = [...new Set(pending.map(normalizeSpelling))].filter(
        (term) => term && !visited.has(term),
      );
      batch.forEach((term) => visited.add(term));
      const results = await Promise.allSettled(
        batch.map(async (term) => {
          const state = await this.prisma.lookupState.findUnique({
            where: { term_language: { term, language } },
          });
          return [
            term,
            state?.dictionaryFetchedAt
              ? null
              : await this.fetchEntry(term, language),
          ] as const;
        }),
      );
      pending = [];
      for (const [index, result] of results.entries()) {
        if (result.status === 'rejected') {
          failures.set(batch[index], result.reason);
          continue;
        }
        const [term, entry] = result.value;
        if (!entry) continue;
        fetched.set(term, entry);
        pending.push(...this.referenceTargets(entry));
      }
    }
    this.excludeFailedDependencies(fetched, failures);
    await this.persistCohort(fetched, language, kind);
    if (failures.size) throw failures.values().next().value;
  }

  private referenceTargets(entry: DictionaryEntry): string[] {
    return entry.references.flatMap((reference) =>
      reference.targetPos &&
      ['morphological_reference', 'alternative_spelling'].includes(
        reference.category,
      )
        ? reference.targets
        : [],
    );
  }

  private excludeFailedDependencies(
    fetched: Map<string, DictionaryEntry>,
    failures: Map<string, unknown>,
  ): void {
    let changed = true;
    while (changed) {
      changed = false;
      for (const [term, entry] of fetched) {
        const failed = entry.references.some(
          (reference) =>
            reference.targetPos &&
            ['morphological_reference', 'alternative_spelling'].includes(
              reference.category,
            ) &&
            reference.targets.some((target) =>
              failures.has(normalizeSpelling(target)),
            ),
        );
        if (failed) {
          failures.set(term, failures.values().next().value);
          fetched.delete(term);
          changed = true;
        }
      }
    }
  }

  private async persistCohort(
    fetched: Map<string, DictionaryEntry>,
    language: string,
    kind: LexicalKind,
  ): Promise<void> {
    const lemmas = [...fetched]
      .filter(([, entry]) => entry.definitions.length)
      .map(([term]) => term);
    const words = lemmas.length
      ? await this.words.ensureMany(lemmas, language, kind)
      : [];
    const byLemma = new Map(words.map((word) => [word.lemma, word]));
    await Promise.all(
      [...fetched].map(async ([term, entry]) => {
        const word = byLemma.get(term);
        if (word)
          await this.definitions.createMany(
            word.id,
            entry.definitions,
            this.dictionary.providerName,
          );
      }),
    );
    if (kind === LexicalKind.word && words.length) {
      await this.morphology.indexParadigms(
        [...fetched].flatMap(([lemma, entry]) => {
          const word = byLemma.get(lemma);
          return word
            ? [...new Set(entry.definitions.map((d) => d.partOfSpeech))].map(
                (partOfSpeech) => ({
                  wordId: word.id,
                  lemma,
                  partOfSpeech,
                  language,
                }),
              )
            : [];
        }),
      );
    }
    await this.persistReferences(fetched, language);
    await this.completeEntries(fetched, byLemma, language);
  }

  private async completeEntries(
    fetched: Map<string, DictionaryEntry>,
    byLemma: Map<
      string,
      Awaited<ReturnType<WordsService['ensureMany']>>[number]
    >,
    language: string,
  ): Promise<void> {
    await Promise.all(
      [...fetched].map(async ([term]) => {
        const word = byLemma.get(term);
        if (word && !word.ipa && this.dictionary.fetchIpa) {
          try {
            const fetchIpa = this.dictionary.fetchIpa.bind(this.dictionary);
            const ipa = await limited(() => fetchIpa(term, language));
            if (ipa) await this.words.setIpaIfMissing(word.id, ipa);
          } catch {
            /* Pronunciation is optional enrichment. */
          }
        }
      }),
    );
    if (!fetched.size) return;
    await this.prisma.$transaction(
      [...fetched.keys()].sort().map((term) =>
        this.prisma.lookupState.upsert({
          where: { term_language: { term, language } },
          create: { term, language, dictionaryFetchedAt: new Date() },
          update: { dictionaryFetchedAt: new Date() },
        }),
      ),
    );
  }

  private async persistReferences(
    fetched: Map<string, DictionaryEntry>,
    language: string,
  ): Promise<void> {
    const targets = [...fetched.values()]
      .flatMap((entry) => this.referenceTargets(entry))
      .map(normalizeSpelling);
    if (!targets.length) return;
    const words = await this.words.findByLemmas(targets, language);
    const byLemma = new Map(words.map((word) => [word.lemma, word]));
    const definitions = await this.definitions.findByWordIds(
      words.map((word) => word.id),
    );
    for (const [lemma, entry] of fetched)
      for (const reference of entry.references) {
        if (
          !reference.targetPos ||
          !['morphological_reference', 'alternative_spelling'].includes(
            reference.category,
          )
        )
          continue;
        for (const target of reference.targets) {
          const word = byLemma.get(normalizeSpelling(target));
          if (!word) continue;
          if (
            definitions.some(
              (d) =>
                d.wordId === word.id &&
                d.partOfSpeech === String(reference.targetPos) &&
                d.provider === this.dictionary.providerName,
            )
          ) {
            await this.morphology.recordValidatedRelationships(
              word.id,
              lemma,
              reference.targetPos,
              reference.relationTypes,
            );
          }
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
          relations: origins
            .filter((o) => o.wordId === word.id)
            .map(({ partOfSpeech, relationType }) => ({
              partOfSpeech,
              relationType,
            })),
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
