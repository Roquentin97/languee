import { Test, TestingModule } from '@nestjs/testing';
import { DefinitionService } from './definitions.service';
import { PrismaService } from '../../../system/core/prisma/prisma.service';
import { PartOfSpeech } from '../../types/part-of-speech.enum';

function makeDefinitionRow(
  overrides: Partial<{
    id: string;
    wordId: string;
    partOfSpeech: string;
    definition: string;
    example: string | null;
    provider: string;
  }> = {},
) {
  return {
    id: overrides.id ?? 'def-id-1',
    wordId: overrides.wordId ?? 'word-id-1',
    partOfSpeech: overrides.partOfSpeech ?? 'verb',
    definition: overrides.definition ?? 'move at a fast pace',
    example: overrides.example ?? null,
    provider: overrides.provider ?? 'dictionaryapi',
    gapFillMetadata: null,
    createdAt: new Date(),
  };
}

describe('DefinitionService', () => {
  let service: DefinitionService;
  let module: TestingModule;

  const prismaMock = {
    definition: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      createMany: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.resetAllMocks();

    module = await Test.createTestingModule({
      providers: [
        DefinitionService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<DefinitionService>(DefinitionService);
  });

  afterEach(async () => {
    await module.close();
  });

  describe('findManyByIds', () => {
    it('returns thin definition summaries with word lemma/kind for the given ids', async () => {
      const rows = [
        {
          id: 'def-1',
          partOfSpeech: 'verb',
          definition: 'move at a fast pace',
          word: { lemma: 'run', kind: 'word' },
        },
      ];
      prismaMock.definition.findMany.mockResolvedValue(rows);

      const result = await service.findManyByIds(['def-1']);

      expect(result).toEqual(rows);
      expect(prismaMock.definition.findMany).toHaveBeenCalledWith({
        where: { id: { in: ['def-1'] } },
        select: {
          id: true,
          partOfSpeech: true,
          definition: true,
          word: { select: { lemma: true, kind: true } },
        },
      });
    });

    it('returns an empty array when no ids match', async () => {
      prismaMock.definition.findMany.mockResolvedValue([]);

      const result = await service.findManyByIds(['nonexistent-id']);

      expect(result).toEqual([]);
    });
  });

  describe('findByWordId', () => {
    it('returns all definitions for the given wordId', async () => {
      const rows = [
        makeDefinitionRow({ id: 'def-1', wordId: 'word-id-1' }),
        makeDefinitionRow({
          id: 'def-2',
          wordId: 'word-id-1',
          partOfSpeech: 'noun',
          definition: 'a run',
        }),
      ];
      prismaMock.definition.findMany.mockResolvedValue(rows);

      const result = await service.findByWordId('word-id-1');

      expect(result).toEqual(rows);
      expect(prismaMock.definition.findMany).toHaveBeenCalledWith({
        where: { wordId: 'word-id-1' },
      });
    });

    it('returns empty array when no definitions exist for the wordId', async () => {
      prismaMock.definition.findMany.mockResolvedValue([]);

      const result = await service.findByWordId('unknown-word-id');

      expect(result).toEqual([]);
    });
  });

  describe('createMany', () => {
    it('bulk inserts without overwriting existing rows and preserves input order and duplicates', async () => {
      const existing = makeDefinitionRow();
      const second = makeDefinitionRow({
        id: 'second',
        partOfSpeech: 'noun',
        definition: 'a run',
      });
      prismaMock.definition.findMany.mockResolvedValue([second, existing]);
      const verb = {
        partOfSpeech: PartOfSpeech.VERB,
        definition: existing.definition,
      };
      const noun = {
        partOfSpeech: PartOfSpeech.NOUN,
        definition: second.definition,
      };
      expect(
        await service.createMany(
          'word-id-1',
          [verb, noun, verb],
          'new-provider',
        ),
      ).toEqual([existing, second, existing]);
      expect(prismaMock.definition.createMany).toHaveBeenCalledTimes(1);
      expect(prismaMock.definition.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skipDuplicates: true,
          data: expect.arrayContaining([
            expect.objectContaining({ provider: 'new-provider' }),
          ]) as unknown,
        }),
      );
      expect(prismaMock.definition.findMany).toHaveBeenCalledTimes(1);
      expect(prismaMock.definition.findUnique).not.toHaveBeenCalled();
    });

    it('does not query storage for empty input', async () => {
      expect(await service.createMany('word-id-1', [], 'provider')).toEqual([]);
      expect(prismaMock.definition.createMany).not.toHaveBeenCalled();
    });
  });
  describe('findByWordIds', () => {
    it('loads complete semantic inventories for all candidate words in stable order', async () => {
      const rows = [
        makeDefinitionRow({ wordId: 'first', partOfSpeech: 'noun' }),
        makeDefinitionRow({ wordId: 'first', partOfSpeech: 'verb' }),
        makeDefinitionRow({ wordId: 'second' }),
      ];
      prismaMock.definition.findMany.mockResolvedValue(rows);
      expect(await service.findByWordIds(['first', 'second'])).toEqual(rows);
      expect(prismaMock.definition.findMany).toHaveBeenCalledWith({
        where: { wordId: { in: ['first', 'second'] } },
        orderBy: { id: 'asc' },
      });
    });
    it('does not query storage when there are no candidate words', async () => {
      expect(await service.findByWordIds([])).toEqual([]);
      expect(prismaMock.definition.findMany).not.toHaveBeenCalled();
    });
  });
});
