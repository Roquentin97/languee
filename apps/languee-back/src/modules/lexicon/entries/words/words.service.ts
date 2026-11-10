import { Injectable } from '@nestjs/common';
import { LexicalKind, Prisma } from '@prisma/client';
import type { Word } from '@prisma/client';
import { PrismaService } from '../../../system/core/prisma/prisma.service';

@Injectable()
export class WordsService {
  constructor(private readonly prisma: PrismaService) {}

  async findByLemma(lemma: string, language: string): Promise<Word | null> {
    return this.prisma.word.findUnique({
      where: { lemma_language: { lemma, language } },
    });
  }

  findByLemmas(lemmas: string[], language: string): Promise<Word[]> {
    if (!lemmas.length) return Promise.resolve([]);
    return this.prisma.word.findMany({
      where: { language, lemma: { in: [...new Set(lemmas)] } },
    });
  }

  async ensureMany(
    lemmas: string[],
    language: string,
    kind: LexicalKind,
  ): Promise<Word[]> {
    if (!lemmas.length) return [];
    const unique = [...new Set(lemmas)];
    await this.prisma.word.createMany({
      data: unique.map((lemma) => ({ lemma, language, kind })),
      skipDuplicates: true,
    });
    return this.prisma.word.findMany({
      where: { language, lemma: { in: unique } },
    });
  }

  findLookupCandidates(
    term: string,
    language: string,
    originWordIds: string[],
  ): Promise<Word[]> {
    return this.prisma.word.findMany({
      where: { language, OR: [{ lemma: term }, { id: { in: originWordIds } }] },
      orderBy: { lemma: 'asc' },
    });
  }

  /**
   * Backfills the phonetic transcription once, first provider wins. A word
   * that already carries an ipa is never overwritten.
   */
  async setIpaIfMissing(wordId: string, ipa: string): Promise<void> {
    await this.prisma.word.updateMany({
      where: { id: wordId, ipa: null },
      data: { ipa },
    });
  }

  async ensureExistsAndReturn(
    lemma: string,
    language: string,
    kind: LexicalKind,
  ) {
    const existing = await this.prisma.word.findUnique({
      where: { lemma_language: { lemma, language } },
    });
    if (existing) return existing;

    try {
      return await this.prisma.word.create({
        data: { lemma, language, kind },
      });
    } catch (err: unknown) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        // Race condition: another request created the word concurrently
        return this.prisma.word.findUniqueOrThrow({
          where: { lemma_language: { lemma, language } },
        });
      }
      throw err;
    }
  }
}
