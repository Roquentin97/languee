import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../core/prisma/prisma.service';
import { PartOfSpeech } from '../vocabulary/enums/part-of-speech.enum';
import { MORPHOLOGY_PROVIDER, normalizeSpelling } from './morphology-provider';
import type { MorphologyProvider, RelationType } from './morphology-provider';
import type {
  CanonicalEntry,
  FormOrigin,
  ParadigmsByWord,
  LexicalParadigm,
} from './morphology.types';
import { projectParadigm, snapshotParadigm } from './paradigm';

type IndexEntry = CanonicalEntry & {
  partOfSpeech: PartOfSpeech;
  language: string;
};

@Injectable()
export class MorphologyService {
  private readonly indexing = new Map<string, Promise<void>>();
  constructor(
    private readonly prisma: PrismaService,
    @Inject(MORPHOLOGY_PROVIDER) private readonly provider: MorphologyProvider,
  ) {}

  /** The caller must confirm this canonical entry's lexical POS first. */
  async indexParadigm(
    entry: CanonicalEntry & { partOfSpeech: PartOfSpeech; language: string },
  ): Promise<void> {
    const forms = await this.provider.getInflections(
      entry.lemma,
      entry.partOfSpeech,
      entry.language,
    );
    if (!forms.length) return;
    await this.prisma.wordForm.createMany({
      data: forms
        .filter((f) => f.form.trim() && !/\s/.test(f.form.trim()))
        .map((f) => ({
          wordId: entry.wordId,
          form: normalizeSpelling(f.form),
          partOfSpeech: entry.partOfSpeech,
          relationType: f.formType,
        })),
      skipDuplicates: true,
    });
  }

  async indexParadigms(entries: IndexEntry[]): Promise<void> {
    const owned: IndexEntry[] = [];
    const flights: Promise<void>[] = [];
    const completions: {
      key: string;
      resolve: () => void;
      reject: (error: unknown) => void;
    }[] = [];
    for (const entry of entries) {
      const key = JSON.stringify([
        entry.wordId,
        entry.partOfSpeech,
        entry.language,
      ]);
      let flight = this.indexing.get(key);
      if (!flight) {
        flight = new Promise<void>((resolve, reject) =>
          completions.push({ key, resolve, reject }),
        );
        this.indexing.set(key, flight);
        owned.push(entry);
      }
      flights.push(flight);
    }
    if (owned.length) {
      void this.indexNewParadigms(owned).then(
        () =>
          completions.forEach(({ key, resolve }) => {
            this.indexing.delete(key);
            resolve();
          }),
        (error: unknown) =>
          completions.forEach(({ key, reject }) => {
            this.indexing.delete(key);
            reject(error);
          }),
      );
    }
    await Promise.all(flights);
  }

  private async indexNewParadigms(entries: IndexEntry[]): Promise<void> {
    if (!entries.length) return;
    if (!this.provider.getInflectionsBatch || entries.length === 1) {
      await Promise.all(entries.map((entry) => this.indexParadigm(entry)));
      return;
    }
    const language = entries[0].language;
    const results = await this.provider.getInflectionsBatch(
      entries.map(({ lemma, partOfSpeech }) => ({ lemma, partOfSpeech })),
      language,
    );
    const byKey = new Map(
      results.map((result) => [
        JSON.stringify([normalizeSpelling(result.lemma), result.partOfSpeech]),
        result.forms,
      ]),
    );
    const data = entries.flatMap((entry) => {
      const forms = byKey.get(
        JSON.stringify([normalizeSpelling(entry.lemma), entry.partOfSpeech]),
      );
      if (!forms) throw new Error('Missing morphology result');
      return forms
        .filter((f) => f.form.trim() && !/\s/.test(f.form.trim()))
        .map((f) => ({
          wordId: entry.wordId,
          form: normalizeSpelling(f.form),
          partOfSpeech: entry.partOfSpeech,
          relationType: f.formType,
        }));
    });
    if (data.length)
      await this.prisma.wordForm.createMany({ data, skipDuplicates: true });
  }

  /** Persists explicit relationships only after dictionary target validation. */
  async recordValidatedRelationships(
    wordId: string,
    surface: string,
    partOfSpeech: PartOfSpeech,
    relationTypes: RelationType[],
  ): Promise<void> {
    if (!relationTypes.length) return;
    await this.prisma.wordForm.createMany({
      data: relationTypes.map((relationType) => ({
        wordId,
        form: normalizeSpelling(surface),
        partOfSpeech,
        relationType,
      })),
      skipDuplicates: true,
    });
  }

  findOrigins(surface: string, language: string): Promise<FormOrigin[]> {
    return this.prisma.wordForm.findMany({
      where: { form: normalizeSpelling(surface), word: { language } },
      select: { wordId: true, partOfSpeech: true, relationType: true },
    });
  }

  async describeEntries(entries: CanonicalEntry[]): Promise<ParadigmsByWord> {
    const result: ParadigmsByWord = new Map();
    if (!entries.length) return result;
    const forms = await this.prisma.wordForm.findMany({
      where: { wordId: { in: [...new Set(entries.map((e) => e.wordId))] } },
    });
    const byWord = new Map<string, typeof forms>();
    for (const form of forms) {
      const rows = byWord.get(form.wordId) ?? [];
      rows.push(form);
      byWord.set(form.wordId, rows);
    }
    for (const entry of entries) {
      const paradigms =
        result.get(entry.wordId) ?? new Map<string, LexicalParadigm>();
      if (paradigms.has(entry.partOfSpeech)) continue;
      const rows = byWord.get(entry.wordId) ?? [];
      paradigms.set(entry.partOfSpeech, {
        ...projectParadigm(entry.lemma, entry.partOfSpeech, rows),
        snapshot: snapshotParadigm(entry.lemma, entry.partOfSpeech, rows),
      });
      result.set(entry.wordId, paradigms);
    }
    return result;
  }
}
