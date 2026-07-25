import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Definition as DbDefinition } from '@prisma/client';
import { PrismaService } from '../core/prisma/prisma.service';
import type { RawDefinitionEntry } from '../dictionary/interfaces/dictionary-api-adapter.interface';
import { DefinitionAlreadyExistsError } from './definitions.errors';

export type { DbDefinition };

export type DefinitionSummary = {
  id: string;
  partOfSpeech: string;
  definition: string;
  word: { lemma: string; kind: string };
};

@Injectable()
export class DefinitionService {
  constructor(private readonly prisma: PrismaService) {}

  async findByWordId(wordId: string): Promise<DbDefinition[]> {
    return this.prisma.definition.findMany({ where: { wordId } });
  }

  findManyByIds(ids: string[]): Promise<DefinitionSummary[]> {
    return this.prisma.definition.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        partOfSpeech: true,
        definition: true,
        word: { select: { lemma: true, kind: true } },
      },
    });
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

  async createOne(
    wordId: string,
    entry: RawDefinitionEntry,
    providerName: string,
  ): Promise<DbDefinition> {
    try {
      return await this.prisma.definition.create({
        data: {
          wordId,
          partOfSpeech: entry.partOfSpeech,
          definition: entry.definition,
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
        throw new DefinitionAlreadyExistsError();
      }
      throw err;
    }
  }
}
