import { Test, TestingModule } from '@nestjs/testing';
import { LookupWordUseCase } from './lookup-word.use-case';
import { DEFINITION_API_ADAPTER } from '../../definitions/definitions.tokens';
import { DefinitionsNotFoundException } from '../dictionary.errors';
import { ProviderUnavailableError } from '../../definitions/definitions.errors';
import { WordsService } from '../../words/words.service';
import { DefinitionService } from '../../definitions/definitions.service';
import type { Word, Definition } from '@prisma/client';

const mockWord: Word = {
  id: 'word-id-1',
  lemma: 'despite',
  language: 'en',
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockDefinitionRow: Definition = {
  id: 'def-id-1',
  wordId: 'word-id-1',
  partOfSpeech: 'preposition',
  definition: 'in spite of',
  example: 'Despite the rain, we went out.',
  provider: 'free-dictionary',
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('LookupWordUseCase', () => {
  let useCase: LookupWordUseCase;

  const adapter = { providerName: 'free-dictionary', fetch: jest.fn() };
  const wordsServiceMock = {
    canonicalise: jest.fn(),
    findByLemma: jest.fn(),
    ensureExistsAndReturn: jest.fn(),
  };
  const definitionServiceMock = {
    findByWordId: jest.fn(),
    createMany: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    wordsServiceMock.canonicalise.mockImplementation((raw: string) =>
      raw.trim().toLowerCase(),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LookupWordUseCase,
        { provide: DEFINITION_API_ADAPTER, useValue: adapter },
        { provide: WordsService, useValue: wordsServiceMock },
        { provide: DefinitionService, useValue: definitionServiceMock },
      ],
    }).compile();

    useCase = module.get<LookupWordUseCase>(LookupWordUseCase);
  });

  describe('cache hit path', () => {
    it('returns cached definitions without calling the adapter', async () => {
      wordsServiceMock.findByLemma.mockResolvedValue(mockWord);
      definitionServiceMock.findByWordId.mockResolvedValue([mockDefinitionRow]);

      const result = await useCase.execute({ word: 'despite', language: 'en' });

      expect(adapter.fetch).not.toHaveBeenCalled();
      expect(result.source).toBe('cache');
      expect(result.lemma).toBe('despite');
      expect(result.definitions).toHaveLength(1);
      expect(result.definitions[0]).toMatchObject({
        id: 'def-id-1',
        part_of_speech: 'preposition',
        definition: 'in spite of',
        example: 'Despite the rain, we went out.',
        provider: 'free-dictionary',
      });
    });

    it('falls through to provider when word exists but has no definitions', async () => {
      wordsServiceMock.findByLemma.mockResolvedValue(mockWord);
      definitionServiceMock.findByWordId.mockResolvedValue([]);
      adapter.fetch.mockResolvedValue([
        { partOfSpeech: 'preposition', definition: 'in spite of', example: null },
      ]);
      wordsServiceMock.ensureExistsAndReturn.mockResolvedValue(mockWord);
      definitionServiceMock.createMany.mockResolvedValue([mockDefinitionRow]);

      const result = await useCase.execute({ word: 'despite', language: 'en' });

      expect(adapter.fetch).toHaveBeenCalledWith('despite', 'en');
      expect(result.source).toBe('provider');
    });
  });

  describe('cache miss / provider path', () => {
    it('calls adapter, persists word and definitions, returns source=provider', async () => {
      wordsServiceMock.findByLemma.mockResolvedValue(null);
      adapter.fetch.mockResolvedValue([
        {
          partOfSpeech: 'preposition',
          definition: 'in spite of',
          example: 'Despite the rain, we went out.',
        },
      ]);
      wordsServiceMock.ensureExistsAndReturn.mockResolvedValue(mockWord);
      definitionServiceMock.createMany.mockResolvedValue([mockDefinitionRow]);

      const result = await useCase.execute({ word: 'despite', language: 'en' });

      expect(adapter.fetch).toHaveBeenCalledWith('despite', 'en');
      expect(wordsServiceMock.ensureExistsAndReturn).toHaveBeenCalledWith(
        'despite',
        'en',
      );
      expect(definitionServiceMock.createMany).toHaveBeenCalledWith(
        'word-id-1',
        expect.arrayContaining([
          expect.objectContaining({ partOfSpeech: 'preposition' }),
        ]),
      );
      expect(result.source).toBe('provider');
      expect(result.lemma).toBe('despite');
      expect(result.definitions).toHaveLength(1);
    });

    it('propagates ProviderUnavailableError when adapter throws it', async () => {
      wordsServiceMock.findByLemma.mockResolvedValue(null);
      adapter.fetch.mockRejectedValue(
        new ProviderUnavailableError('free-dictionary'),
      );

      await expect(
        useCase.execute({ word: 'despite', language: 'en' }),
      ).rejects.toBeInstanceOf(ProviderUnavailableError);

      expect(wordsServiceMock.ensureExistsAndReturn).not.toHaveBeenCalled();
    });

    it('throws DefinitionsNotFoundException when provider returns empty array', async () => {
      wordsServiceMock.findByLemma.mockResolvedValue(null);
      adapter.fetch.mockResolvedValue([]);

      await expect(
        useCase.execute({ word: 'despite', language: 'en' }),
      ).rejects.toBeInstanceOf(DefinitionsNotFoundException);

      expect(wordsServiceMock.ensureExistsAndReturn).not.toHaveBeenCalled();
    });
  });

  describe('canonicalisation', () => {
    it('canonicalises input word before querying the repository', async () => {
      wordsServiceMock.findByLemma.mockResolvedValue(mockWord);
      definitionServiceMock.findByWordId.mockResolvedValue([mockDefinitionRow]);

      await useCase.execute({ word: '  Despite  ', language: 'en' });

      expect(wordsServiceMock.canonicalise).toHaveBeenCalledWith('  Despite  ');
      expect(wordsServiceMock.findByLemma).toHaveBeenCalledWith(
        'despite',
        'en',
      );
    });
  });
});
