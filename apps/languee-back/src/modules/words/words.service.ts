import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Word } from '@prisma/client';
import { PrismaService } from '../core/prisma/prisma.service';
import { Normalizer } from './nlp/normalizer';
import { PreLemmatizerStub } from './nlp/pre-lemmatizer.stub';
import { Lemmatizer } from './nlp/lemmatizer/lemmatizer';

@Injectable()
export class WordsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly normalizer: Normalizer,
    private readonly preLemmatizer: PreLemmatizerStub,
    private readonly lemmatizer: Lemmatizer,
  ) {}

  canonicalise(raw: string): string {
    const normalized = this.normalizer.normalize({ raw });
    const preLemmatized = this.preLemmatizer.preLemmatize(normalized);
    const { lemma } = this.lemmatizer.lemmatize(preLemmatized);
    return lemma;
  }

  async findByLemma(lemma: string, language: string): Promise<Word | null> {
    return this.prisma.word.findUnique({
      where: { lemma_language: { lemma, language } },
    });
  }

  async findOrCreate(lemma: string, language: string) {
    const existing = await this.prisma.word.findUnique({
      where: { lemma_language: { lemma, language } },
    });
    if (existing) return existing;

    try {
      return await this.prisma.word.create({
        data: { lemma, language },
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
