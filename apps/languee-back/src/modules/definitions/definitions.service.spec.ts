import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { DefinitionService } from './definitions.service';
import { PrismaService } from '../core/prisma/prisma.service';
import { PartOfSpeech } from '../vocabulary/enums/part-of-speech.enum';
import type { InflectionForms } from '../dictionary/types/inflection-forms.types';

function makeDefinitionRow(
  overrides: Partial<{
    id: string;
    wordId: string;
    partOfSpeech: string;
    definition: string;
    example: string | null;
    provider: string;
    hasIrregularForms: boolean;
    inflectionForms: InflectionForms | null;
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
    hasIrregularForms: overrides.hasIrregularForms ?? false,
    inflectionForms:
      overrides.inflectionForms !== undefined
        ? overrides.inflectionForms
        : null,
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
    it('persists each entry with the caller-provided provider name', async () => {
      const entries = [
        {
          partOfSpeech: PartOfSpeech.VERB,
          definition: 'move at a fast pace',
          example: 'She runs.',
        },
        {
          partOfSpeech: PartOfSpeech.NOUN,
          definition: 'a run',
          example: undefined,
        },
      ];
      const rows = [
        makeDefinitionRow({ id: 'def-1', example: 'She runs.' }),
        makeDefinitionRow({
          id: 'def-2',
          partOfSpeech: 'noun',
          definition: 'a run',
          example: null,
        }),
      ];

      prismaMock.definition.findUnique.mockResolvedValue(null);
      prismaMock.definition.create
        .mockResolvedValueOnce(rows[0])
        .mockResolvedValueOnce(rows[1]);

      const result = await service.createMany(
        'word-id-1',
        entries,
        'dictionaryapi',
      );

      expect(result).toEqual(rows);
      expect(prismaMock.definition.create).toHaveBeenCalledTimes(2);
      expect(prismaMock.definition.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            wordId: 'word-id-1',
            partOfSpeech: 'verb',
            definition: 'move at a fast pace',
            example: 'She runs.',
            provider: 'dictionaryapi',
          }) as unknown,
        }),
      );
    });

    it('returns existing row without calling create when definition already exists', async () => {
      const existing = makeDefinitionRow();
      prismaMock.definition.findUnique.mockResolvedValue(existing);

      const result = await service.createMany(
        'word-id-1',
        [
          {
            partOfSpeech: PartOfSpeech.VERB,
            definition: 'move at a fast pace',
          },
        ],
        'dictionaryapi',
      );

      expect(result).toEqual([existing]);
      expect(prismaMock.definition.create).not.toHaveBeenCalled();
    });

    it('falls back to findUniqueOrThrow when concurrent create hits P2002', async () => {
      prismaMock.definition.findUnique.mockResolvedValue(null);

      const p2002 = new Prisma.PrismaClientKnownRequestError('Unique', {
        code: 'P2002',
        clientVersion: '5.0.0',
      });
      prismaMock.definition.create.mockRejectedValue(p2002);
      const concurrentRow = makeDefinitionRow();
      prismaMock.definition.findUniqueOrThrow.mockResolvedValue(concurrentRow);

      const result = await service.createMany(
        'word-id-1',
        [
          {
            partOfSpeech: PartOfSpeech.VERB,
            definition: 'move at a fast pace',
          },
        ],
        'dictionaryapi',
      );

      expect(result).toEqual([concurrentRow]);
      expect(prismaMock.definition.findUniqueOrThrow).toHaveBeenCalledTimes(1);
    });

    it('re-throws non-P2002 Prisma errors from create', async () => {
      prismaMock.definition.findUnique.mockResolvedValue(null);

      const p2025 = new Prisma.PrismaClientKnownRequestError('Not found', {
        code: 'P2025',
        clientVersion: '5.0.0',
      });
      prismaMock.definition.create.mockRejectedValue(p2025);

      await expect(
        service.createMany(
          'word-id-1',
          [
            {
              partOfSpeech: PartOfSpeech.VERB,
              definition: 'move at a fast pace',
            },
          ],
          'dictionaryapi',
        ),
      ).rejects.toThrow();
    });

    it('returns empty array when entries is empty', async () => {
      const result = await service.createMany('word-id-1', [], 'dictionaryapi');

      expect(result).toEqual([]);
      expect(prismaMock.definition.findUnique).not.toHaveBeenCalled();
      expect(prismaMock.definition.create).not.toHaveBeenCalled();
    });

    it('passes inflection metadata when provided', async () => {
      const inflectionForms: InflectionForms = {
        type: 'verb',
        base: 'run',
        past: 'ran',
      };
      prismaMock.definition.findUnique.mockResolvedValue(null);
      prismaMock.definition.create.mockResolvedValue(
        makeDefinitionRow({ hasIrregularForms: true, inflectionForms }),
      );

      await service.createMany(
        'word-id-1',
        [
          {
            partOfSpeech: PartOfSpeech.VERB,
            definition: 'move at a fast pace',
            hasIrregularForms: true,
            inflectionForms,
          },
        ],
        'dictionaryapi',
      );

      expect(prismaMock.definition.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            hasIrregularForms: true,
            inflectionForms,
          }) as unknown,
        }),
      );
    });

    it('uses Prisma.JsonNull when inflectionForms is undefined', async () => {
      prismaMock.definition.findUnique.mockResolvedValue(null);
      prismaMock.definition.create.mockResolvedValue(makeDefinitionRow());

      await service.createMany(
        'word-id-1',
        [
          {
            partOfSpeech: PartOfSpeech.VERB,
            definition: 'move at a fast pace',
          },
        ],
        'dictionaryapi',
      );

      expect(prismaMock.definition.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            inflectionForms: expect.anything() as unknown,
          }) as unknown,
        }),
      );
    });
  });
});
