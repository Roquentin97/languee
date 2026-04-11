import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { WordsService } from './words.service';
import { PrismaService } from '../prisma/prisma.service';

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

  it('findOrCreate: returns existing word without creating', async () => {
    const row = makeWord();
    prismaMock.word.findUnique.mockResolvedValue(row);

    const result = await service.findOrCreate('run', 'en');

    expect(result).toEqual(row);
    expect(prismaMock.word.create).not.toHaveBeenCalled();
  });

  it('findOrCreate: creates word when not found and returns it', async () => {
    const row = makeWord();
    prismaMock.word.findUnique.mockResolvedValue(null);
    prismaMock.word.create.mockResolvedValue(row);

    const result = await service.findOrCreate('run', 'en');

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

    const result = await service.findOrCreate('run', 'en');

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

    await expect(service.findOrCreate('run', 'en')).rejects.toThrow();
  });
});
