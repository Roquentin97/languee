import { Injectable } from '@nestjs/common';
import { LexicalEntryKind, Prisma } from '@prisma/client';
import type { LexicalEntry } from '@prisma/client';
import { PrismaService } from '../../../system/core/prisma/prisma.service';

@Injectable()
export class LexicalEntriesService {
  constructor(private readonly prisma: PrismaService) {}

  async findByLemma(
    lemma: string,
    language: string,
  ): Promise<LexicalEntry | null> {
    return this.prisma.lexicalEntry.findUnique({
      where: { lemma_language: { lemma, language } },
    });
  }

  findByLemmas(lemmas: string[], language: string): Promise<LexicalEntry[]> {
    if (!lemmas.length) return Promise.resolve([]);
    return this.prisma.lexicalEntry.findMany({
      where: { language, lemma: { in: [...new Set(lemmas)] } },
    });
  }

  async ensureMany(
    lemmas: string[],
    language: string,
    kind: LexicalEntryKind,
  ): Promise<LexicalEntry[]> {
    if (!lemmas.length) return [];
    const unique = [...new Set(lemmas)];
    await this.prisma.lexicalEntry.createMany({
      data: unique.map((lemma) => ({ lemma, language, kind })),
      skipDuplicates: true,
    });
    return this.prisma.lexicalEntry.findMany({
      where: { language, lemma: { in: unique } },
    });
  }

  findLookupCandidates(
    term: string,
    language: string,
    originEntryIds: string[],
  ): Promise<LexicalEntry[]> {
    return this.prisma.lexicalEntry.findMany({
      where: {
        language,
        OR: [{ lemma: term }, { id: { in: originEntryIds } }],
      },
      orderBy: { lemma: 'asc' },
    });
  }

  /**
   * Backfills the phonetic transcription once, first provider wins. An entry
   * that already carries an ipa is never overwritten.
   */
  async setIpaIfMissing(entryId: string, ipa: string): Promise<void> {
    await this.prisma.lexicalEntry.updateMany({
      where: { id: entryId, ipa: null },
      data: { ipa },
    });
  }

  async ensureExistsAndReturn(
    lemma: string,
    language: string,
    kind: LexicalEntryKind,
  ) {
    const existing = await this.prisma.lexicalEntry.findUnique({
      where: { lemma_language: { lemma, language } },
    });
    if (existing) return existing;

    try {
      return await this.prisma.lexicalEntry.create({
        data: { lemma, language, kind },
      });
    } catch (err: unknown) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        // Race condition: another request created the entry concurrently
        return this.prisma.lexicalEntry.findUniqueOrThrow({
          where: { lemma_language: { lemma, language } },
        });
      }
      throw err;
    }
  }
}
