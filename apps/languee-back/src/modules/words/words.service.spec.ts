import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
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
      normalized_form: input.raw.trim().toLowerCase(),
      is_multi_word: false,
      pos: null,
    })),
  };

  const preLemmatizerMock = {
    preLemmatize: jest
      .fn()
      .mockImplementation((input: { normalized_form: string }) => ({
        lemma: input.normalized_form,
        short_circuited: false,
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

  it('findOrCreate: returns existing word without creating', async () => {
    const row = makeWord();
    prismaMock.word.findUnique.mockResolvedValue(row);

    const result = await service.ensureExistsAndReturn('run', 'en');

    expect(result).toEqual(row);
    expect(prismaMock.word.create).not.toHaveBeenCalled();
  });

  it('findOrCreate: creates word when not found and returns it', async () => {
    const row = makeWord();
    prismaMock.word.findUnique.mockResolvedValue(null);
    prismaMock.word.create.mockResolvedValue(row);

    const result = await service.ensureExistsAndReturn('run', 'en');

    expect(result).toEqual(row);
    expect(prismaMock.word.create).toHaveBeenCalledWith({
      data: { lemma: 'run', language: 'en' },
    });
  });

  it('findOrCreate: P2002 race on create falls back to findUniqueOrThrow', async () => {
    const row = makeWord();
    prismaMock.word.findUnique.mockResolvedValue(null);

    const p2002 = new Prisma.PrismaClientKnownRequestError('Unique', {
      code: 'P2002',
      clientVersion: '5.0.0',
    });
    prismaMock.word.create.mockRejectedValue(p2002);
    prismaMock.word.findUniqueOrThrow.mockResolvedValue(row);

    const result = await service.ensureExistsAndReturn('run', 'en');

    expect(result).toEqual(row);
    expect(prismaMock.word.findUniqueOrThrow).toHaveBeenCalledWith({
      where: { lemma_language: { lemma: 'run', language: 'en' } },
    });
  });

  it('findOrCreate: non-P2002 error on create is re-thrown', async () => {
    prismaMock.word.findUnique.mockResolvedValue(null);

    const p2025 = new Prisma.PrismaClientKnownRequestError('Not found', {
      code: 'P2025',
      clientVersion: '5.0.0',
    });
    prismaMock.word.create.mockRejectedValue(p2025);

    await expect(service.ensureExistsAndReturn('run', 'en')).rejects.toThrow();
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
