import { Test, TestingModule } from '@nestjs/testing';
import { LexicalKind, Prisma } from '@prisma/client';
import { WordsService } from './words.service';
import { PrismaService } from '../../../system/core/prisma/prisma.service';

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

describe('WordsService', () => {
  let service: WordsService;
  let module: TestingModule;

  const prismaMock = {
    word: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      updateMany: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    module = await Test.createTestingModule({
      providers: [
        WordsService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<WordsService>(WordsService);
  });

  afterEach(async () => {
    await module.close();
  });

  it('ensureExistsAndReturn: returns existing word without creating', async () => {
    const row = makeWord();
    prismaMock.word.findUnique.mockResolvedValue(row);

    const result = await service.ensureExistsAndReturn(
      'run',
      'en',
      LexicalKind.word,
    );

    expect(result).toEqual(row);
    expect(prismaMock.word.create).not.toHaveBeenCalled();
  });

  it('ensureExistsAndReturn: creates word when not found and returns it', async () => {
    const row = makeWord();
    prismaMock.word.findUnique.mockResolvedValue(null);
    prismaMock.word.create.mockResolvedValue(row);

    const result = await service.ensureExistsAndReturn(
      'run',
      'en',
      LexicalKind.word,
    );

    expect(result).toEqual(row);
    expect(prismaMock.word.create).toHaveBeenCalledWith({
      data: { lemma: 'run', language: 'en', kind: LexicalKind.word },
    });
  });

  it('ensureExistsAndReturn: sets kind on create when an explicit kind is provided', async () => {
    prismaMock.word.findUnique.mockResolvedValue(null);
    prismaMock.word.create.mockResolvedValue(makeWord({ lemma: 'run into' }));

    await service.ensureExistsAndReturn(
      'run into',
      'en',
      LexicalKind.phrasal_verb,
    );

    expect(prismaMock.word.create).toHaveBeenCalledWith({
      data: {
        lemma: 'run into',
        language: 'en',
        kind: LexicalKind.phrasal_verb,
      },
    });
  });

  it('ensureExistsAndReturn: P2002 race on create falls back to findUniqueOrThrow', async () => {
    const row = makeWord();
    prismaMock.word.findUnique.mockResolvedValue(null);

    const p2002 = new Prisma.PrismaClientKnownRequestError('Unique', {
      code: 'P2002',
      clientVersion: '5.0.0',
    });
    prismaMock.word.create.mockRejectedValue(p2002);
    prismaMock.word.findUniqueOrThrow.mockResolvedValue(row);

    const result = await service.ensureExistsAndReturn(
      'run',
      'en',
      LexicalKind.word,
    );

    expect(result).toEqual(row);
    expect(prismaMock.word.findUniqueOrThrow).toHaveBeenCalledWith({
      where: { lemma_language: { lemma: 'run', language: 'en' } },
    });
  });

  it('ensureExistsAndReturn: non-P2002 error on create is re-thrown', async () => {
    prismaMock.word.findUnique.mockResolvedValue(null);

    const p2025 = new Prisma.PrismaClientKnownRequestError('Not found', {
      code: 'P2025',
      clientVersion: '5.0.0',
    });
    prismaMock.word.create.mockRejectedValue(p2025);

    await expect(
      service.ensureExistsAndReturn('run', 'en', LexicalKind.word),
    ).rejects.toThrow();
  });

  describe('findByLemma', () => {
    it('happy path: returns word when found', async () => {
      const row = makeWord();
      prismaMock.word.findUnique.mockResolvedValue(row);

      const result = await service.findByLemma('run', 'en');

      expect(result).toEqual(row);
      expect(prismaMock.word.findUnique).toHaveBeenCalledWith({
        where: { lemma_language: { lemma: 'run', language: 'en' } },
      });
    });

    it('edge case: returns null when word not found', async () => {
      prismaMock.word.findUnique.mockResolvedValue(null);

      const result = await service.findByLemma('unknown', 'en');

      expect(result).toBeNull();
    });
  });

  describe('setIpaIfMissing', () => {
    it('happy path: writes the ipa only where it is still null', async () => {
      prismaMock.word.updateMany.mockResolvedValue({ count: 1 });

      await service.setIpaIfMissing('word-id-1', '/ɹʌn/');

      expect(prismaMock.word.updateMany).toHaveBeenCalledWith({
        where: { id: 'word-id-1', ipa: null },
        data: { ipa: '/ɹʌn/' },
      });
    });

    it('edge case: a word that already has an ipa is left untouched (filtered by the where clause)', async () => {
      prismaMock.word.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.setIpaIfMissing('word-id-1', '/ɹʌn/'),
      ).resolves.toBeUndefined();
    });
  });
  describe('findLookupCandidates', () => {
    it('loads the literal spelling and supplied reverse-index origins in lexical order', async () => {
      const rows = [makeWord({ lemma: 'better' }), makeWord({ lemma: 'well' })];
      prismaMock.word.findMany.mockResolvedValue(rows);
      expect(
        await service.findLookupCandidates('better', 'en', ['well-id']),
      ).toEqual(rows);
      expect(prismaMock.word.findMany).toHaveBeenCalledWith({
        where: {
          language: 'en',
          OR: [{ lemma: 'better' }, { id: { in: ['well-id'] } }],
        },
        orderBy: { lemma: 'asc' },
      });
    });
    it('can resolve a literal spelling without any reverse-index origins', async () => {
      prismaMock.word.findMany.mockResolvedValue([]);
      expect(await service.findLookupCandidates('unknown', 'en', [])).toEqual(
        [],
      );
      expect(prismaMock.word.findMany).toHaveBeenCalledWith({
        where: {
          language: 'en',
          OR: [{ lemma: 'unknown' }, { id: { in: [] } }],
        },
        orderBy: { lemma: 'asc' },
      });
    });
  });
});
