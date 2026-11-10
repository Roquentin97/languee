import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Definition as DbDefinition, Word } from '@prisma/client';
import { PrismaService } from '../core/prisma/prisma.service';
import type { RawDefinitionEntry } from '../dictionary/interfaces/dictionary-api-adapter.interface';
import { DefinitionAlreadyExistsError } from './definitions.errors';

export type { DbDefinition };

export type DefinitionWithWord = DbDefinition & { word: Word };

export type DefinitionSummary = {
  id: string;
  partOfSpeech: string;
  definition: string;
  word: { lemma: string; kind: string };
};

@Injectable()
export class DefinitionService {
  private readonly activeWrites = new Map<string, Promise<DbDefinition[]>>();
  constructor(private readonly prisma: PrismaService) {}

  async findByWordId(wordId: string): Promise<DbDefinition[]> {
    return this.prisma.definition.findMany({ where: { wordId } });
  }

  findByWordIds(wordIds: string[]): Promise<DbDefinition[]> {
    if (!wordIds.length) return Promise.resolve([]);
    return this.prisma.definition.findMany({
      where: { wordId: { in: wordIds } },
      orderBy: { id: 'asc' },
    });
  }

  findByIdWithWord(id: string): Promise<DefinitionWithWord | null> {
    return this.prisma.definition.findUnique({
      where: { id },
      include: { word: true },
    });
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
    const key = JSON.stringify([wordId, entries, providerName]);
    const existing = this.activeWrites.get(key);
    if (existing) return existing;
    const work = this.createManyOnce(wordId, entries, providerName);
    this.activeWrites.set(key, work);
    void work.then(
      () => this.activeWrites.delete(key),
      () => this.activeWrites.delete(key),
    );
    return work;
  }

  private async createManyOnce(
    wordId: string,
    entries: RawDefinitionEntry[],
    providerName: string,
  ): Promise<DbDefinition[]> {
    if (!entries.length) return [];
    await this.prisma.definition.createMany({
      data: entries.map((entry) => ({
        wordId,
        partOfSpeech: entry.partOfSpeech,
        definition: entry.definition,
        example: entry.example ?? null,
        provider: providerName,
      })),
      skipDuplicates: true,
    });
    const rows = await this.prisma.definition.findMany({
      where: {
        wordId,
        OR: entries.map(({ partOfSpeech, definition }) => ({
          partOfSpeech,
          definition,
        })),
      },
    });
    const byKey = new Map(
      rows.map((row) => [
        JSON.stringify([row.partOfSpeech, row.definition]),
        row,
      ]),
    );
    return entries.map((entry) => {
      const row = byKey.get(
        JSON.stringify([entry.partOfSpeech, entry.definition]),
      );
      if (!row) throw new Error('Persisted definition not found');
      return row;
    });
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
