import { Test, TestingModule } from '@nestjs/testing';
import { LexicalKind, Prisma } from '@prisma/client';
import { WordsService } from './words.service';
import { PrismaService } from '../core/prisma/prisma.service';
import { Normalizer } from './nlp/normalizer';
import { PreLemmatizerStub } from './nlp/pre-lemmatizer.stub';
import { Lemmatizer } from './nlp/lemmatizer/lemmatizer';

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
      create: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
  };

  const normalizerMock = {
    normalize: jest.fn().mockImplementation((input: { raw: string }) => ({
      normalizedForm: input.raw.trim().toLowerCase(),
      isMultiWord: false,
      pos: null,
    })),
  };

  const preLemmatizerMock = {
    preLemmatize: jest
      .fn()
      .mockImplementation((input: { normalizedForm: string }) => ({
        lemma: input.normalizedForm,
        shortCircuited: false,
      })),
  };

  const lemmatizerMock = {
    lemmatize: jest.fn().mockImplementation((input: { lemma: string }) => ({
      lemma: input.lemma,
    })),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    module = await Test.createTestingModule({
      providers: [
        WordsService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: Normalizer, useValue: normalizerMock },
        { provide: PreLemmatizerStub, useValue: preLemmatizerMock },
        { provide: Lemmatizer, useValue: lemmatizerMock },
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

  describe('canonicalise', () => {
    it('happy path: trims and lowercases via NLP pipeline', () => {
      const result = service.canonicalise('  Running  ');
      expect(result).toBe('running');
    });

    it('edge case: empty string returns empty string', () => {
      const result = service.canonicalise('');
      expect(result).toBe('');
    });

    it('delegates to normalizer, preLemmatizer, and lemmatizer in sequence', () => {
      service.canonicalise('Test');
      expect(normalizerMock.normalize).toHaveBeenCalledWith({ raw: 'Test' });
      expect(preLemmatizerMock.preLemmatize).toHaveBeenCalled();
      expect(lemmatizerMock.lemmatize).toHaveBeenCalled();
    });
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
});
