import { Test, TestingModule } from '@nestjs/testing';
import { LexicalEntryKind, Prisma } from '@prisma/client';
import { LexicalEntriesService } from './lexical-entries.service';
import { PrismaService } from '../../../system/core/prisma/prisma.service';

function makeEntry(
  overrides: Partial<{
    id: string;
    lemma: string;
    language: string;
    kind: LexicalEntryKind;
  }> = {},
) {
  return {
    id: overrides.id ?? 'word-id-1',
    lemma: overrides.lemma ?? 'run',
    language: overrides.language ?? 'en',
    kind: overrides.kind ?? LexicalEntryKind.word,
    ipa: null,
    createdAt: new Date(),
  };
}

describe('LexicalEntriesService', () => {
  let service: LexicalEntriesService;
  let module: TestingModule;

  const prismaMock = {
    lexicalEntry: {
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
        LexicalEntriesService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<LexicalEntriesService>(LexicalEntriesService);
  });

  afterEach(async () => {
    await module.close();
  });

  it('ensureExistsAndReturn: returns existing word without creating', async () => {
    const row = makeEntry();
    prismaMock.lexicalEntry.findUnique.mockResolvedValue(row);

    const result = await service.ensureExistsAndReturn(
      'run',
      'en',
      LexicalEntryKind.word,
    );

    expect(result).toEqual(row);
    expect(prismaMock.lexicalEntry.create).not.toHaveBeenCalled();
  });

  it('ensureExistsAndReturn: creates word when not found and returns it', async () => {
    const row = makeEntry();
    prismaMock.lexicalEntry.findUnique.mockResolvedValue(null);
    prismaMock.lexicalEntry.create.mockResolvedValue(row);

    const result = await service.ensureExistsAndReturn(
      'run',
      'en',
      LexicalEntryKind.word,
    );

    expect(result).toEqual(row);
    expect(prismaMock.lexicalEntry.create).toHaveBeenCalledWith({
      data: { lemma: 'run', language: 'en', kind: LexicalEntryKind.word },
    });
  });

  it('persists an idiom discriminator without requiring idiom detection', async () => {
    const row = makeEntry({ kind: LexicalEntryKind.idiom });
    prismaMock.lexicalEntry.findUnique.mockResolvedValue(null);
    prismaMock.lexicalEntry.create.mockResolvedValue(row);

    await service.ensureExistsAndReturn(
      'kick the bucket',
      'en',
      LexicalEntryKind.idiom,
    );

    expect(prismaMock.lexicalEntry.create).toHaveBeenCalledWith({
      data: {
        lemma: 'kick the bucket',
        language: 'en',
        kind: LexicalEntryKind.idiom,
      },
    });
  });

  it('ensureExistsAndReturn: sets kind on create when an explicit kind is provided', async () => {
    prismaMock.lexicalEntry.findUnique.mockResolvedValue(null);
    prismaMock.lexicalEntry.create.mockResolvedValue(
      makeEntry({ lemma: 'run into' }),
    );

    await service.ensureExistsAndReturn(
      'run into',
      'en',
      LexicalEntryKind.phrasal_verb,
    );

    expect(prismaMock.lexicalEntry.create).toHaveBeenCalledWith({
      data: {
        lemma: 'run into',
        language: 'en',
        kind: LexicalEntryKind.phrasal_verb,
      },
    });
  });

  it('ensureExistsAndReturn: P2002 race on create falls back to findUniqueOrThrow', async () => {
    const row = makeEntry();
    prismaMock.lexicalEntry.findUnique.mockResolvedValue(null);

    const p2002 = new Prisma.PrismaClientKnownRequestError('Unique', {
      code: 'P2002',
      clientVersion: '5.0.0',
    });
    prismaMock.lexicalEntry.create.mockRejectedValue(p2002);
    prismaMock.lexicalEntry.findUniqueOrThrow.mockResolvedValue(row);

    const result = await service.ensureExistsAndReturn(
      'run',
      'en',
      LexicalEntryKind.word,
    );

    expect(result).toEqual(row);
    expect(prismaMock.lexicalEntry.findUniqueOrThrow).toHaveBeenCalledWith({
      where: { lemma_language: { lemma: 'run', language: 'en' } },
    });
  });

  it('ensureExistsAndReturn: non-P2002 error on create is re-thrown', async () => {
    prismaMock.lexicalEntry.findUnique.mockResolvedValue(null);

    const p2025 = new Prisma.PrismaClientKnownRequestError('Not found', {
      code: 'P2025',
      clientVersion: '5.0.0',
    });
    prismaMock.lexicalEntry.create.mockRejectedValue(p2025);

    await expect(
      service.ensureExistsAndReturn('run', 'en', LexicalEntryKind.word),
    ).rejects.toThrow();
  });

  describe('findByLemma', () => {
    it('happy path: returns word when found', async () => {
      const row = makeEntry();
      prismaMock.lexicalEntry.findUnique.mockResolvedValue(row);

      const result = await service.findByLemma('run', 'en');

      expect(result).toEqual(row);
      expect(prismaMock.lexicalEntry.findUnique).toHaveBeenCalledWith({
        where: { lemma_language: { lemma: 'run', language: 'en' } },
      });
    });

    it('edge case: returns null when word not found', async () => {
      prismaMock.lexicalEntry.findUnique.mockResolvedValue(null);

      const result = await service.findByLemma('unknown', 'en');

      expect(result).toBeNull();
    });
  });

  describe('setIpaIfMissing', () => {
    it('happy path: writes the ipa only where it is still null', async () => {
      prismaMock.lexicalEntry.updateMany.mockResolvedValue({ count: 1 });

      await service.setIpaIfMissing('word-id-1', '/ɹʌn/');

      expect(prismaMock.lexicalEntry.updateMany).toHaveBeenCalledWith({
        where: { id: 'word-id-1', ipa: null },
        data: { ipa: '/ɹʌn/' },
      });
    });

    it('edge case: a word that already has an ipa is left untouched (filtered by the where clause)', async () => {
      prismaMock.lexicalEntry.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.setIpaIfMissing('word-id-1', '/ɹʌn/'),
      ).resolves.toBeUndefined();
    });
  });
  describe('findLookupCandidates', () => {
    it('loads the literal spelling and supplied reverse-index origins in lexical order', async () => {
      const rows = [
        makeEntry({ lemma: 'better' }),
        makeEntry({ lemma: 'well' }),
      ];
      prismaMock.lexicalEntry.findMany.mockResolvedValue(rows);
      expect(
        await service.findLookupCandidates('better', 'en', ['well-id']),
      ).toEqual(rows);
      expect(prismaMock.lexicalEntry.findMany).toHaveBeenCalledWith({
        where: {
          language: 'en',
          OR: [{ lemma: 'better' }, { id: { in: ['well-id'] } }],
        },
        orderBy: { lemma: 'asc' },
      });
    });
    it('can resolve a literal spelling without any reverse-index origins', async () => {
      prismaMock.lexicalEntry.findMany.mockResolvedValue([]);
      expect(await service.findLookupCandidates('unknown', 'en', [])).toEqual(
        [],
      );
      expect(prismaMock.lexicalEntry.findMany).toHaveBeenCalledWith({
        where: {
          language: 'en',
          OR: [{ lemma: 'unknown' }, { id: { in: [] } }],
        },
        orderBy: { lemma: 'asc' },
      });
    });
  });
});
