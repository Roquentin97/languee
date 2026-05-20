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
  hasIrregularForms: false,
  inflectionForms: null,
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
        { isIrregular: undefined, inflectionForms: undefined },
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

  describe('lookup() — NLP lemma / inflection forwarding', () => {
    it('when input.lemma is provided, canonicalise() is NOT called and lemma is used directly', async () => {
      wordsServiceMock.findByLemma.mockResolvedValue(null);
      wordsServiceMock.ensureExistsAndReturn.mockResolvedValue(mockWord);
      definitionServiceMock.fetchAndPersist.mockResolvedValue([
        mockDefinitionRow,
      ]);

      await service.lookup({ word: 'walked', lemma: 'walk', language: 'en' });

      expect(wordsServiceMock.canonicalise).not.toHaveBeenCalled();
      expect(wordsServiceMock.findByLemma).toHaveBeenCalledWith('walk', 'en');
    });

    it('when input.lemma is not provided, canonicalise() IS called on input.word', async () => {
      wordsServiceMock.findByLemma.mockResolvedValue(null);
      wordsServiceMock.ensureExistsAndReturn.mockResolvedValue(mockWord);
      definitionServiceMock.fetchAndPersist.mockResolvedValue([
        mockDefinitionRow,
      ]);

      await service.lookup({ word: 'Despite', language: 'en' });

      expect(wordsServiceMock.canonicalise).toHaveBeenCalledWith('Despite');
    });

    it('inflectionForms and isIrregular are forwarded to fetchAndPersist', async () => {
      const inflectionForms = { base: 'walk', past: 'walked' };
      wordsServiceMock.findByLemma.mockResolvedValue(null);
      wordsServiceMock.ensureExistsAndReturn.mockResolvedValue(mockWord);
      definitionServiceMock.fetchAndPersist.mockResolvedValue([
        mockDefinitionRow,
      ]);

      await service.lookup({
        word: 'walked',
        lemma: 'walk',
        language: 'en',
        isIrregular: false,
        inflectionForms,
      });

      expect(definitionServiceMock.fetchAndPersist).toHaveBeenCalledWith(
        mockWord.id,
        'walk',
        'en',
        { isIrregular: false, inflectionForms },
      );
    });

    it('definitions returned include hasIrregularForms and inflectionForms from persisted rows', async () => {
      const inflectionForms = { base: 'walk', past: 'walked' };
      const enrichedRow: Definition = {
        ...mockDefinitionRow,
        hasIrregularForms: true,
        inflectionForms:
          inflectionForms as unknown as Definition['inflectionForms'],
      };
      wordsServiceMock.findByLemma.mockResolvedValue(null);
      wordsServiceMock.ensureExistsAndReturn.mockResolvedValue(mockWord);
      definitionServiceMock.fetchAndPersist.mockResolvedValue([enrichedRow]);

      const result = await service.lookup({
        word: 'walked',
        lemma: 'walk',
        language: 'en',
        isIrregular: true,
        inflectionForms,
      });

      expect(result.definitions[0].hasIrregularForms).toBe(true);
      expect(result.definitions[0].inflectionForms).toEqual(inflectionForms);
    });

    it('cache hit path returns hasIrregularForms and inflectionForms from cached rows', async () => {
      const inflectionForms = { base: 'walk', past: 'walked' };
      const cachedRow: Definition = {
        ...mockDefinitionRow,
        hasIrregularForms: false,
        inflectionForms:
          inflectionForms as unknown as Definition['inflectionForms'],
      };
      wordsServiceMock.findByLemma.mockResolvedValue(mockWord);
      definitionServiceMock.findByWordId.mockResolvedValue([cachedRow]);

      const result = await service.lookup({
        word: 'despite',
        language: 'en',
      });

      expect(result.source).toBe('cache');
      expect(result.definitions[0].hasIrregularForms).toBe(false);
      expect(result.definitions[0].inflectionForms).toEqual(inflectionForms);
    });

    it('cache hit with null inflectionForms returns null in result', async () => {
      const cachedRow: Definition = {
        ...mockDefinitionRow,
        hasIrregularForms: false,
        inflectionForms: null,
      };
      wordsServiceMock.findByLemma.mockResolvedValue(mockWord);
      definitionServiceMock.findByWordId.mockResolvedValue([cachedRow]);

      const result = await service.lookup({ word: 'despite', language: 'en' });

      expect(result.definitions[0].inflectionForms).toBeNull();
    });
  });
});
