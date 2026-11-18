import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Definition as DbDefinition, LexicalEntry } from '@prisma/client';
import { PrismaService } from '../../../system/core/prisma/prisma.service';
import type { RawDefinitionEntry } from '../../types/definition-entry.types';
import { DefinitionAlreadyExistsError } from './definitions.errors';

export type { DbDefinition };

export type DefinitionWithEntry = DbDefinition & { entry: LexicalEntry };

export type DefinitionSummary = {
  id: string;
  partOfSpeech: string;
  definition: string;
  entry: { lemma: string; kind: string };
};

@Injectable()
export class DefinitionService {
  private readonly activeWrites = new Map<string, Promise<DbDefinition[]>>();
  constructor(private readonly prisma: PrismaService) {}

  async findByEntryId(entryId: string): Promise<DbDefinition[]> {
    return this.prisma.definition.findMany({ where: { entryId } });
  }

  findByEntryIds(entryIds: string[]): Promise<DbDefinition[]> {
    if (!entryIds.length) return Promise.resolve([]);
    return this.prisma.definition.findMany({
      where: { entryId: { in: entryIds } },
      orderBy: { id: 'asc' },
    });
  }

  findByIdWithEntry(id: string): Promise<DefinitionWithEntry | null> {
    return this.prisma.definition.findUnique({
      where: { id },
      include: { entry: true },
    });
  }

  findManyByIds(ids: string[]): Promise<DefinitionSummary[]> {
    return this.prisma.definition.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        partOfSpeech: true,
        definition: true,
        entry: { select: { lemma: true, kind: true } },
      },
    });
  }

  async createMany(
    entryId: string,
    entries: RawDefinitionEntry[],
    providerName: string,
  ): Promise<DbDefinition[]> {
    const key = JSON.stringify([entryId, entries, providerName]);
    const existing = this.activeWrites.get(key);
    if (existing) return existing;
    const work = this.createManyOnce(entryId, entries, providerName);
    this.activeWrites.set(key, work);
    void work.then(
      () => this.activeWrites.delete(key),
      () => this.activeWrites.delete(key),
    );
    return work;
  }

  private async createManyOnce(
    entryId: string,
    entries: RawDefinitionEntry[],
    providerName: string,
  ): Promise<DbDefinition[]> {
    if (!entries.length) return [];
    await this.prisma.definition.createMany({
      data: entries.map((entry) => ({
        entryId,
        partOfSpeech: entry.partOfSpeech,
        definition: entry.definition,
        example: entry.example ?? null,
        provider: providerName,
      })),
      skipDuplicates: true,
    });
    const rows = await this.prisma.definition.findMany({
      where: {
        entryId,
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
    entryId: string,
    entry: RawDefinitionEntry,
    providerName: string,
  ): Promise<DbDefinition> {
    try {
      return await this.prisma.definition.create({
        data: {
          entryId,
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
