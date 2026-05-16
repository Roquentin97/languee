import { Test, TestingModule } from '@nestjs/testing';
import { DictionaryService } from './dictionary.service';
import { DefinitionsNotFoundException } from './dictionary.errors';
import { ProviderUnavailableError } from '../definitions/definitions.errors';
import { WordsService } from '../words/words.service';
import { DefinitionService } from '../definitions/definitions.service';
import type { Word, Definition } from '@prisma/client';

const mockWord: Word = {
  id: 'word-id-1',
  lemma: 'despite',
  language: 'en',
  ipa: null,
  createdAt: new Date(),
};

const mockDefinitionRow: Definition = {
  id: 'def-id-1',
  wordId: 'word-id-1',
  partOfSpeech: 'preposition',
  definition: 'in spite of',
  example: 'Despite the rain, we went out.',
  provider: 'free-dictionary',
  gapFillMetadata: null,
  createdAt: new Date(),
};

describe('DictionaryService', () => {
  let service: DictionaryService;

  const wordsServiceMock = {
    canonicalise: jest.fn(),
    findByLemma: jest.fn(),
    ensureExistsAndReturn: jest.fn(),
  };
  const definitionServiceMock = {
    findByWordId: jest.fn(),
    fetchAndPersist: jest.fn(),
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    wordsServiceMock.canonicalise.mockImplementation((raw: string) =>
      raw.trim().toLowerCase(),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DictionaryService,
        { provide: WordsService, useValue: wordsServiceMock },
        { provide: DefinitionService, useValue: definitionServiceMock },
      ],
    }).compile();

    service = module.get<DictionaryService>(DictionaryService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('lookup() — cache hit path', () => {
    it('returns cached definitions without calling the provider', async () => {
      wordsServiceMock.findByLemma.mockResolvedValue(mockWord);
      definitionServiceMock.findByWordId.mockResolvedValue([mockDefinitionRow]);

      const result = await service.lookup({ word: 'despite', language: 'en' });

      expect(definitionServiceMock.fetchAndPersist).not.toHaveBeenCalled();
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
      wordsServiceMock.ensureExistsAndReturn.mockResolvedValue(mockWord);
      definitionServiceMock.fetchAndPersist.mockResolvedValue([
        mockDefinitionRow,
      ]);

      const result = await service.lookup({ word: 'despite', language: 'en' });

      expect(definitionServiceMock.fetchAndPersist).toHaveBeenCalledWith(
        'word-id-1',
        'despite',
        'en',
      );
      expect(result.source).toBe('provider');
    });
  });

  describe('lookup() — cache miss / provider path', () => {
    it('persists word and definitions via services, returns source=provider', async () => {
      wordsServiceMock.findByLemma.mockResolvedValue(null);
      wordsServiceMock.ensureExistsAndReturn.mockResolvedValue(mockWord);
      definitionServiceMock.fetchAndPersist.mockResolvedValue([
        mockDefinitionRow,
      ]);

      const result = await service.lookup({ word: 'despite', language: 'en' });

      expect(wordsServiceMock.ensureExistsAndReturn).toHaveBeenCalledWith(
        'despite',
        'en',
      );
      expect(result.source).toBe('provider');
      expect(result.lemma).toBe('despite');
      expect(result.definitions).toHaveLength(1);
    });

    it('propagates ProviderUnavailableError from DefinitionService', async () => {
      wordsServiceMock.findByLemma.mockResolvedValue(null);
      wordsServiceMock.ensureExistsAndReturn.mockResolvedValue(mockWord);
      definitionServiceMock.fetchAndPersist.mockRejectedValue(
        new ProviderUnavailableError('free-dictionary'),
      );

      await expect(
        service.lookup({ word: 'despite', language: 'en' }),
      ).rejects.toBeInstanceOf(ProviderUnavailableError);
    });

    it('throws DefinitionsNotFoundException when provider returns no definitions', async () => {
      wordsServiceMock.findByLemma.mockResolvedValue(null);
      wordsServiceMock.ensureExistsAndReturn.mockResolvedValue(mockWord);
      definitionServiceMock.fetchAndPersist.mockResolvedValue([]);

      await expect(
        service.lookup({ word: 'despite', language: 'en' }),
      ).rejects.toBeInstanceOf(DefinitionsNotFoundException);
    });
  });

  describe('lookup() — canonicalisation', () => {
    it('canonicalises input word before querying', async () => {
      wordsServiceMock.findByLemma.mockResolvedValue(mockWord);
      definitionServiceMock.findByWordId.mockResolvedValue([mockDefinitionRow]);

      await service.lookup({ word: '  Despite  ', language: 'en' });

      expect(wordsServiceMock.canonicalise).toHaveBeenCalledWith('  Despite  ');
      expect(wordsServiceMock.findByLemma).toHaveBeenCalledWith(
        'despite',
        'en',
      );
    });
  });
});
