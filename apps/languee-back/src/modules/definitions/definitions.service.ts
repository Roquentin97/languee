import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Definition as DbDefinition } from '@prisma/client';
import { PrismaService } from '../core/prisma/prisma.service';
import type { RawDefinitionEntry } from '../dictionary/interfaces/dictionary-api-adapter.interface';

export type { DbDefinition };

@Injectable()
export class DefinitionService {
  constructor(private readonly prisma: PrismaService) {}

  async findByWordId(wordId: string): Promise<DbDefinition[]> {
    return this.prisma.definition.findMany({ where: { wordId } });
  }

  async createMany(
    wordId: string,
    entries: RawDefinitionEntry[],
    providerName: string,
  ): Promise<DbDefinition[]> {
    return Promise.all(
      entries.map(async (entry) => {
        const key = {
          wordId,
          partOfSpeech: entry.partOfSpeech,
          definition: entry.definition,
        };

        const existing = await this.prisma.definition.findUnique({
          where: { wordId_partOfSpeech_definition: key },
        });
        if (existing) return existing;

        try {
          return await this.prisma.definition.create({
            data: {
              ...key,
              example: entry.example ?? null,
              provider: providerName,
              hasIrregularForms: entry.hasIrregularForms ?? false,
              inflectionForms:
                entry.inflectionForms != null
                  ? (entry.inflectionForms as Prisma.InputJsonValue)
                  : Prisma.JsonNull,
            },
          });
        } catch (err: unknown) {
          if (
            err instanceof Prisma.PrismaClientKnownRequestError &&
            err.code === 'P2002'
          ) {
            return this.prisma.definition.findUniqueOrThrow({
              where: { wordId_partOfSpeech_definition: key },
            });
          }
          throw err;
        }
      }),
    );
  }
}
