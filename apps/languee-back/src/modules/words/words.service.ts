import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class WordsService {
  constructor(private readonly prisma: PrismaService) {}

  async findOrCreate(lemma: string, language: string) {
    return this.prisma.word.upsert({
      where: { lemma_language: { lemma, language } },
      update: {},
      create: { lemma, language },
    });
  }
}
