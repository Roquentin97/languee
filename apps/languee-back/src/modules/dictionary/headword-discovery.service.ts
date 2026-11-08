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
import { projectParadigm } from '../morphology/paradigm';
import { DICTIONARY_API_ADAPTER } from './dictionary.tokens';
import type { IDictionaryApiAdapter } from './interfaces/dictionary-api-adapter.interface';
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
    private readonly morphology: MorphologyProvider,
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
    const process = async (spelling: string): Promise<void> => {
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
      if (entry.definitions.length) {
        const word = await this.words.ensureExistsAndReturn(
          lemma,
          language,
          kind,
        );
        await this.definitions.createMany(
          word.id,
          entry.definitions,
          this.dictionary.providerName,
        );
        for (const pos of new Set(
          entry.definitions.map((d) => d.partOfSpeech),
        )) {
          const forms =
            kind === LexicalKind.word
              ? await this.morphology.getInflections(lemma, pos, language)
              : [];
          await this.prisma.wordForm.createMany({
            data: forms
              .filter((f) => f.form.trim() && !/\s/.test(f.form.trim()))
              .map((f) => ({
                wordId: word.id,
                form: normalizeSpelling(f.form),
                partOfSpeech: pos,
                relationType: f.formType,
              })),
            skipDuplicates: true,
          });
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
      for (const reference of entry.references) {
        if (
          !['morphological_reference', 'alternative_spelling'].includes(
            reference.category,
          ) ||
          !reference.targetPos
        )
          continue;
        for (const target of reference.targets) {
          await process(target);
          // A cycle cannot validate a target from partially persisted definitions.
          const targetState = await this.prisma.lookupState.findUnique({
            where: {
              term_language: { term: normalizeSpelling(target), language },
            },
          });
          if (!targetState?.dictionaryFetchedAt) continue;
          const word = await this.prisma.word.findUnique({
            where: {
              lemma_language: { lemma: normalizeSpelling(target), language },
            },
            include: { definitions: true },
          });
          if (
            !word?.definitions.some(
              (d) =>
                d.partOfSpeech === String(reference.targetPos) &&
                d.provider === this.dictionary.providerName,
            )
          )
            continue;
          await this.prisma.wordForm.createMany({
            data: reference.relationTypes.map((relationType) => ({
              wordId: word.id,
              form: lemma,
              partOfSpeech: reference.targetPos as PartOfSpeech,
              relationType,
            })),
            skipDuplicates: true,
          });
        }
      }
      await this.prisma.lookupState.upsert({
        where,
        create: { term: lemma, language, dictionaryFetchedAt: new Date() },
        update: { dictionaryFetchedAt: new Date() },
      });
    };
    await process(term);
    if (kind === LexicalKind.word) {
      const candidates = await this.morphology.findLemmaCandidates(
        term,
        language,
      );
      const reverse = await this.prisma.wordForm.findMany({
        where: { form: term, word: { language } },
        include: { word: true },
      });
      const lemmas = new Set([
        ...candidates.map((c) => c.lemma),
        ...reverse.map((r) => r.word.lemma),
        ...(contextualLemma ? [contextualLemma] : []),
      ]);
      for (const lemma of lemmas) await process(lemma);
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

  private async resolve(
    term: string,
    language: string,
  ): Promise<ResolvedHeadword[]> {
    const words = await this.prisma.word.findMany({
      where: {
        language,
        OR: [{ lemma: term }, { forms: { some: { form: term } } }],
      },
      include: { definitions: { orderBy: { id: 'asc' } }, forms: true },
      orderBy: { lemma: 'asc' },
    });
    return words
      .map((word) => {
        const allowed = new Set(
          word.forms.filter((f) => f.form === term).map((f) => f.partOfSpeech),
        );
        return {
          wordId: word.id,
          lemma: word.lemma,
          definitions: word.definitions
            .filter((d) => word.lemma === term || allowed.has(d.partOfSpeech))
            .map((d) => ({
              id: d.id,
              partOfSpeech: d.partOfSpeech as PartOfSpeech,
              definition: d.definition,
              example: d.example,
              provider: d.provider,
              ...projectParadigm(word.lemma, d.partOfSpeech, word.forms),
            })),
        };
      })
      .filter((w) => w.definitions.length > 0);
  }
}
