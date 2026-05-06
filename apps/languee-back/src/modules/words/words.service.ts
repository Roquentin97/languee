import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../core/prisma/prisma.service';

@Injectable()
export class WordsService {
  constructor(private readonly prisma: PrismaService) {}

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
