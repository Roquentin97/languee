import { Test, TestingModule } from '@nestjs/testing';
import { LookupWordUseCase } from './lookup-word.use-case';
import { WORDS_REPOSITORY, DEFINITIONS_REPOSITORY } from '../dictionary.tokens';
import { DEFINITION_API_ADAPTER } from '../../definitions/definitions.tokens';
import {
  NORMALIZER,
  PRE_LEMMATIZER,
  LEMMATIZER,
} from '../../pipeline/pipeline.tokens';
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

  const wordsRepository = { findByLemma: jest.fn() };
  const definitionsRepository = { findByWordId: jest.fn() };
  const adapter = { providerName: 'free-dictionary', fetch: jest.fn() };
  const wordsServiceMock = { findOrCreate: jest.fn() };
  const definitionServiceMock = {
    createMany: jest.fn(),
    findByWordId: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LookupWordUseCase,
        {
          provide: NORMALIZER,
          useValue: {
            normalize: (input: { raw: string }) => ({
              normalized_form: input.raw.trim().toLowerCase(),
              is_multi_word: false,
              pos: null,
            }),
          },
        },
        {
          provide: PRE_LEMMATIZER,
          useValue: {
            preLemmatize: (input: { normalized_form: string }) => ({
              lemma: input.normalized_form,
              short_circuited: false,
            }),
          },
        },
        {
          provide: LEMMATIZER,
          useValue: {
            lemmatize: (input: { lemma: string }) => ({ lemma: input.lemma }),
          },
        },
        { provide: WORDS_REPOSITORY, useValue: wordsRepository },
        { provide: DEFINITIONS_REPOSITORY, useValue: definitionsRepository },
        { provide: DEFINITION_API_ADAPTER, useValue: adapter },
        { provide: WordsService, useValue: wordsServiceMock },
        { provide: DefinitionService, useValue: definitionServiceMock },
      ],
    }).compile();

    useCase = module.get<LookupWordUseCase>(LookupWordUseCase);
  });

  describe('cache hit path', () => {
    it('returns cached definitions without calling the adapter', async () => {
      wordsRepository.findByLemma.mockResolvedValue(mockWord);
      definitionsRepository.findByWordId.mockResolvedValue([mockDefinitionRow]);

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

    it('throws DefinitionsNotFoundException when word exists but has no definitions in cache', async () => {
      wordsRepository.findByLemma.mockResolvedValue(mockWord);
      definitionsRepository.findByWordId.mockResolvedValue([]);

      await expect(
        useCase.execute({ word: 'despite', language: 'en' }),
      ).rejects.toBeInstanceOf(DefinitionsNotFoundException);

      expect(adapter.fetch).not.toHaveBeenCalled();
    });
  });

  describe('cache miss / provider path', () => {
    it('calls adapter, persists word and definitions, returns source=provider', async () => {
      wordsRepository.findByLemma.mockResolvedValue(null);
      adapter.fetch.mockResolvedValue([
        {
          partOfSpeech: 'preposition',
          definition: 'in spite of',
          example: 'Despite the rain, we went out.',
        },
      ]);
      wordsServiceMock.findOrCreate.mockResolvedValue(mockWord);
      definitionServiceMock.createMany.mockResolvedValue([mockDefinitionRow]);

      const result = await useCase.execute({ word: 'despite', language: 'en' });

      expect(adapter.fetch).toHaveBeenCalledWith('despite', 'en');
      expect(wordsServiceMock.findOrCreate).toHaveBeenCalledWith(
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
      wordsRepository.findByLemma.mockResolvedValue(null);
      adapter.fetch.mockRejectedValue(
        new ProviderUnavailableError('free-dictionary'),
      );

      await expect(
        useCase.execute({ word: 'despite', language: 'en' }),
      ).rejects.toBeInstanceOf(ProviderUnavailableError);

      expect(wordsServiceMock.findOrCreate).not.toHaveBeenCalled();
    });

    it('throws DefinitionsNotFoundException when provider returns empty array', async () => {
      wordsRepository.findByLemma.mockResolvedValue(null);
      adapter.fetch.mockResolvedValue([]);

      await expect(
        useCase.execute({ word: 'despite', language: 'en' }),
      ).rejects.toBeInstanceOf(DefinitionsNotFoundException);

      expect(wordsServiceMock.findOrCreate).not.toHaveBeenCalled();
    });
  });

  describe('normalization', () => {
    it('normalizes input word (trim + lowercase) before querying the repository', async () => {
      wordsRepository.findByLemma.mockResolvedValue(mockWord);
      definitionsRepository.findByWordId.mockResolvedValue([mockDefinitionRow]);

      await useCase.execute({ word: '  Despite  ', language: 'en' });

      expect(wordsRepository.findByLemma).toHaveBeenCalledWith('despite', 'en');
    });
  });
});
