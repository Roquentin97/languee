import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { DefinitionService } from './definitions.service';
import { PrismaService } from '../core/prisma/prisma.service';
import { WordsService } from '../words/words.service';
import { DEFINITION_API_ADAPTER } from './definitions.tokens';
import {
  DefinitionNotFoundError,
  ProviderUnavailableError,
} from './definitions.errors';
import { IDefinitionApiAdapter } from './interfaces/definition-api-adapter.interface';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeWord(
  overrides: Partial<{ id: string; lemma: string; language: string }> = {},
) {
  return {
    id: overrides.id ?? 'word-id-1',
    lemma: overrides.lemma ?? 'run',
    language: overrides.language ?? 'en',
    ipa: null,
    createdAt: new Date(),
  };
}

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

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

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

  const wordsServiceMock = {
    ensureExistsAndReturn: jest.fn(),
  };

  const adapterMock: jest.Mocked<IDefinitionApiAdapter> = {
    providerName: 'dictionaryapi',
    fetch: jest.fn(),
  };

  beforeEach(async () => {
    jest.resetAllMocks();

    module = await Test.createTestingModule({
      providers: [
        DefinitionService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: WordsService, useValue: wordsServiceMock },
        { provide: DEFINITION_API_ADAPTER, useValue: adapterMock },
      ],
    }).compile();

    service = module.get<DefinitionService>(DefinitionService);
  });

  afterEach(async () => {
    await module.close();
  });

  it('happy path: creates definition when not found and returns mapped result', async () => {
    const word = makeWord();
    wordsServiceMock.ensureExistsAndReturn.mockResolvedValue(word);
    adapterMock.fetch.mockResolvedValue([
      {
        partOfSpeech: 'verb',
        definition: 'move at a fast pace',
        example: 'She runs every morning.',
      },
    ]);
    prismaMock.definition.findUnique.mockResolvedValue(null);
    const row = makeDefinitionRow({ example: 'She runs every morning.' });
    prismaMock.definition.create.mockResolvedValue(row);

    const result = await service.provide({ lemma: 'run', language: 'en' });

    expect(result).toHaveLength(1);
    expect(result[0].term).toBe('run');
    expect(result[0].definition).toBe('move at a fast pace');
    expect(result[0].part_of_speech).toBe('verb');
    expect(result[0].provider).toBe('dictionaryapi');
    expect(result[0].examples).toEqual(['She runs every morning.']);
  });

  it('delegates word resolution to WordsService, not prisma.word directly', async () => {
    wordsServiceMock.ensureExistsAndReturn.mockResolvedValue(makeWord());
    adapterMock.fetch.mockResolvedValue([
      { partOfSpeech: 'verb', definition: 'move at a fast pace' },
    ]);
    prismaMock.definition.findUnique.mockResolvedValue(makeDefinitionRow());

    await service.provide({ lemma: 'run', language: 'en' });

    expect(wordsServiceMock.ensureExistsAndReturn).toHaveBeenCalledWith(
      'run',
      'en',
    );
  });

  it('returns existing definition without calling create', async () => {
    wordsServiceMock.ensureExistsAndReturn.mockResolvedValue(makeWord());
    adapterMock.fetch.mockResolvedValue([
      { partOfSpeech: 'verb', definition: 'move at a fast pace' },
    ]);
    prismaMock.definition.findUnique.mockResolvedValue(makeDefinitionRow());

    const result = await service.provide({ lemma: 'run', language: 'en' });

    expect(result).toHaveLength(1);
    expect(prismaMock.definition.create).not.toHaveBeenCalled();
  });

  it('throws DefinitionNotFoundError when adapter returns empty array', async () => {
    wordsServiceMock.ensureExistsAndReturn.mockResolvedValue(makeWord());
    adapterMock.fetch.mockResolvedValue([]);

    await expect(
      service.provide({ lemma: 'zzznonsense', language: 'en' }),
    ).rejects.toBeInstanceOf(DefinitionNotFoundError);
  });

  it('DefinitionNotFoundError message includes lemma', async () => {
    wordsServiceMock.ensureExistsAndReturn.mockResolvedValue(makeWord());
    adapterMock.fetch.mockResolvedValue([]);

    const err = await service
      .provide({ lemma: 'zzznonsense', language: 'fr' })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(DefinitionNotFoundError);
    expect((err as DefinitionNotFoundError).message).toContain('zzznonsense');
  });

  it('propagates ProviderUnavailableError from adapter', async () => {
    wordsServiceMock.ensureExistsAndReturn.mockResolvedValue(makeWord());
    adapterMock.fetch.mockRejectedValue(
      new ProviderUnavailableError('dictionaryapi', new Error('HTTP 500')),
    );

    await expect(
      service.provide({ lemma: 'run', language: 'en' }),
    ).rejects.toBeInstanceOf(ProviderUnavailableError);
  });

  it('wraps unexpected adapter error in ProviderUnavailableError', async () => {
    wordsServiceMock.ensureExistsAndReturn.mockResolvedValue(makeWord());
    adapterMock.fetch.mockRejectedValue(new Error('unexpected'));

    await expect(
      service.provide({ lemma: 'run', language: 'en' }),
    ).rejects.toBeInstanceOf(ProviderUnavailableError);
  });

  it('EC: P2002 on create falls back to findUniqueOrThrow', async () => {
    wordsServiceMock.ensureExistsAndReturn.mockResolvedValue(makeWord());
    adapterMock.fetch.mockResolvedValue([
      { partOfSpeech: 'verb', definition: 'move at a fast pace' },
    ]);
    prismaMock.definition.findUnique.mockResolvedValue(null);

    const p2002 = new Prisma.PrismaClientKnownRequestError('Unique', {
      code: 'P2002',
      clientVersion: '5.0.0',
    });
    prismaMock.definition.create.mockRejectedValue(p2002);
    prismaMock.definition.findUniqueOrThrow.mockResolvedValue(
      makeDefinitionRow(),
    );

    const result = await service.provide({ lemma: 'run', language: 'en' });
    expect(result).toHaveLength(1);
    expect(prismaMock.definition.findUniqueOrThrow).toHaveBeenCalledTimes(1);
  });

  it('EC: non-P2002 Prisma error on create is re-thrown', async () => {
    wordsServiceMock.ensureExistsAndReturn.mockResolvedValue(makeWord());
    adapterMock.fetch.mockResolvedValue([
      { partOfSpeech: 'verb', definition: 'move at a fast pace' },
    ]);
    prismaMock.definition.findUnique.mockResolvedValue(null);

    const p2025 = new Prisma.PrismaClientKnownRequestError('Not found', {
      code: 'P2025',
      clientVersion: '5.0.0',
    });
    prismaMock.definition.create.mockRejectedValue(p2025);

    await expect(
      service.provide({ lemma: 'run', language: 'en' }),
    ).rejects.toThrow();
  });

  it('row with null example maps to empty examples array', async () => {
    wordsServiceMock.ensureExistsAndReturn.mockResolvedValue(makeWord());
    adapterMock.fetch.mockResolvedValue([
      { partOfSpeech: 'verb', definition: 'move at a fast pace' },
    ]);
    prismaMock.definition.findUnique.mockResolvedValue(null);
    prismaMock.definition.create.mockResolvedValue(
      makeDefinitionRow({ example: null }),
    );

    const result = await service.provide({ lemma: 'run', language: 'en' });
    expect(result[0].examples).toEqual([]);
  });

  it('handles multiple definitions from adapter', async () => {
    wordsServiceMock.ensureExistsAndReturn.mockResolvedValue(makeWord());
    adapterMock.fetch.mockResolvedValue([
      { partOfSpeech: 'verb', definition: 'move fast' },
      { partOfSpeech: 'noun', definition: 'a run' },
    ]);
    prismaMock.definition.findUnique.mockResolvedValue(null);
    prismaMock.definition.create
      .mockResolvedValueOnce(
        makeDefinitionRow({
          id: 'def-1',
          partOfSpeech: 'verb',
          definition: 'move fast',
        }),
      )
      .mockResolvedValueOnce(
        makeDefinitionRow({
          id: 'def-2',
          partOfSpeech: 'noun',
          definition: 'a run',
        }),
      );

    const result = await service.provide({ lemma: 'run', language: 'en' });
    expect(result).toHaveLength(2);
    expect(prismaMock.definition.create).toHaveBeenCalledTimes(2);
  });

  // -------------------------------------------------------------------------
  // findByWordId
  // -------------------------------------------------------------------------

  describe('findByWordId', () => {
    it('happy path: returns all definitions for the given wordId', async () => {
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

    it('edge case: returns empty array when no definitions exist for the wordId', async () => {
      prismaMock.definition.findMany.mockResolvedValue([]);

      const result = await service.findByWordId('unknown-word-id');

      expect(result).toEqual([]);
      expect(prismaMock.definition.findMany).toHaveBeenCalledWith({
        where: { wordId: 'unknown-word-id' },
      });
    });
  });

  // -------------------------------------------------------------------------
  // createMany
  // -------------------------------------------------------------------------

  describe('createMany', () => {
    it('happy path: persists each entry and returns the created rows', async () => {
      const entries = [
        {
          partOfSpeech: 'verb',
          definition: 'move at a fast pace',
          example: 'She runs.',
        },
        { partOfSpeech: 'noun', definition: 'a run', example: undefined },
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

      const result = await service.createMany('word-id-1', entries);

      expect(result).toEqual(rows);
      expect(prismaMock.definition.create).toHaveBeenCalledTimes(2);
      expect(prismaMock.definition.create).toHaveBeenCalledWith({
        data: {
          wordId: 'word-id-1',
          partOfSpeech: 'verb',
          definition: 'move at a fast pace',
          example: 'She runs.',
          provider: 'dictionaryapi',
        },
      });
    });

    it('returns existing row without calling create when definition already exists', async () => {
      const existing = makeDefinitionRow();
      prismaMock.definition.findUnique.mockResolvedValue(existing);

      const result = await service.createMany('word-id-1', [
        { partOfSpeech: 'verb', definition: 'move at a fast pace' },
      ]);

      expect(result).toEqual([existing]);
      expect(prismaMock.definition.create).not.toHaveBeenCalled();
    });

    it('duplicate handling: P2002 on create falls back to findUniqueOrThrow', async () => {
      prismaMock.definition.findUnique.mockResolvedValue(null);

      const p2002 = new Prisma.PrismaClientKnownRequestError('Unique', {
        code: 'P2002',
        clientVersion: '5.0.0',
      });
      prismaMock.definition.create.mockRejectedValue(p2002);
      const concurrentRow = makeDefinitionRow();
      prismaMock.definition.findUniqueOrThrow.mockResolvedValue(concurrentRow);

      const result = await service.createMany('word-id-1', [
        { partOfSpeech: 'verb', definition: 'move at a fast pace' },
      ]);

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
        service.createMany('word-id-1', [
          { partOfSpeech: 'verb', definition: 'move at a fast pace' },
        ]),
      ).rejects.toThrow();
    });

    it('edge case: returns empty array when entries is empty', async () => {
      const result = await service.createMany('word-id-1', []);

      expect(result).toEqual([]);
      expect(prismaMock.definition.findUnique).not.toHaveBeenCalled();
      expect(prismaMock.definition.create).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // fetchAndPersist
  // -------------------------------------------------------------------------

  describe('fetchAndPersist', () => {
    it('happy path: fetches from adapter, persists, and returns rows', async () => {
      adapterMock.fetch.mockResolvedValue([
        { partOfSpeech: 'verb', definition: 'move fast', example: 'She runs.' },
      ]);
      prismaMock.definition.findUnique.mockResolvedValue(null);
      const row = makeDefinitionRow({ example: 'She runs.' });
      prismaMock.definition.create.mockResolvedValue(row);

      const result = await service.fetchAndPersist('word-id-1', 'run', 'en');

      expect(adapterMock.fetch.mock.calls).toContainEqual(['run', 'en']);
      expect(result).toEqual([row]);
    });

    it('returns empty array without calling createMany when adapter returns nothing', async () => {
      adapterMock.fetch.mockResolvedValue([]);

      const result = await service.fetchAndPersist('word-id-1', 'zzz', 'en');

      expect(result).toEqual([]);
      expect(prismaMock.definition.findUnique).not.toHaveBeenCalled();
      expect(prismaMock.definition.create).not.toHaveBeenCalled();
    });

    it('propagates ProviderUnavailableError from adapter', async () => {
      adapterMock.fetch.mockRejectedValue(
        new ProviderUnavailableError('dictionaryapi', new Error('HTTP 500')),
      );

      await expect(
        service.fetchAndPersist('word-id-1', 'run', 'en'),
      ).rejects.toBeInstanceOf(ProviderUnavailableError);
    });
  });
});
