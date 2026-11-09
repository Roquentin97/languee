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

@Injectable()
export class MorphologyService {
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
