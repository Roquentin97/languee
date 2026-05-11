import { Injectable } from '@nestjs/common';
import type { Word } from '@prisma/client';
import { PrismaService } from '../../core/prisma/prisma.service';
import type { IWordsRepository } from '../interfaces/words-repository.interface';

@Injectable()
export class PrismaWordsRepository implements IWordsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByLemma(lemma: string, language: string): Promise<Word | null> {
    return this.prisma.word.findUnique({
      where: { lemma_language: { lemma, language } },
    });
  }
}
