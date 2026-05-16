import { Test, TestingModule } from '@nestjs/testing';
import { VocabularyService } from './vocabulary.service';
import { DictionaryService } from '../dictionary/dictionary.service';
import { CardsService } from '../cards/cards.service';
import { DefinitionsNotFoundException } from '../dictionary/dictionary.errors';

const mockDictionaryService = {
  lookup: jest.fn(),
};

const mockCardsService = {
  findCardsByDefinitionIdsAndUserId: jest.fn(),
};

const baseDefinition = {
  id: 'def-id-1',
  part_of_speech: 'verb',
  definition: 'to move fast',
  example: 'She ran quickly.',
  provider: 'free-dictionary',
};

const baseOutput = {
  lemma: 'run',
  source: 'cache' as const,
  definitions: [baseDefinition],
};

describe('VocabularyService', () => {
  let service: VocabularyService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VocabularyService,
        { provide: DictionaryService, useValue: mockDictionaryService },
        { provide: CardsService, useValue: mockCardsService },
      ],
    }).compile();

    service = module.get<VocabularyService>(VocabularyService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('lookup()', () => {
    it('happy path — cache hit, user has cards for definitions, decks array is populated', async () => {
      mockDictionaryService.lookup.mockResolvedValue({
        ...baseOutput,
        source: 'cache',
      });
      mockCardsService.findCardsByDefinitionIdsAndUserId.mockResolvedValue([
        {
          definitionId: 'def-id-1',
          deck: { id: 'deck-id-1', name: 'My Deck' },
        },
      ]);

      const result = await service.lookup({
        word: 'run',
        language: 'en',
        userId: 'user-id-1',
      });

      expect(result.source).toBe('cache');
      expect(result.lemma).toBe('run');
      expect(result.definitions[0].decks).toHaveLength(1);
      expect(result.definitions[0].decks[0]).toEqual({
        id: 'deck-id-1',
        name: 'My Deck',
      });
    });

    it('happy path — provider fetch, deck enrichment still applied', async () => {
      mockDictionaryService.lookup.mockResolvedValue({
        ...baseOutput,
        source: 'provider',
      });
      mockCardsService.findCardsByDefinitionIdsAndUserId.mockResolvedValue([
        {
          definitionId: 'def-id-1',
          deck: { id: 'deck-id-1', name: 'My Deck' },
        },
      ]);

      const result = await service.lookup({
        word: 'run',
        language: 'en',
        userId: 'user-id-1',
      });

      expect(result.source).toBe('provider');
      expect(result.definitions[0].decks).toHaveLength(1);
    });

    it('edge case — definition without matching card has empty decks array', async () => {
      mockDictionaryService.lookup.mockResolvedValue({
        ...baseOutput,
        definitions: [
          baseDefinition,
          {
            id: 'def-id-2',
            part_of_speech: 'noun',
            definition: 'a run',
            example: null,
            provider: 'free-dictionary',
          },
        ],
      });
      mockCardsService.findCardsByDefinitionIdsAndUserId.mockResolvedValue([
        {
          definitionId: 'def-id-1',
          deck: { id: 'deck-id-1', name: 'My Deck' },
        },
      ]);

      const result = await service.lookup({
        word: 'run',
        language: 'en',
        userId: 'user-id-1',
      });

      expect(result.definitions[0].decks).toHaveLength(1);
      expect(result.definitions[1].decks).toEqual([]);
    });

    it('edge case — user has no cards at all, all definitions return empty decks arrays', async () => {
      mockDictionaryService.lookup.mockResolvedValue(baseOutput);
      mockCardsService.findCardsByDefinitionIdsAndUserId.mockResolvedValue([]);

      const result = await service.lookup({
        word: 'run',
        language: 'en',
        userId: 'user-id-1',
      });

      expect(result.definitions[0].decks).toEqual([]);
    });

    it('edge case — cards from another user do not appear (query scoped by userId)', async () => {
      mockDictionaryService.lookup.mockResolvedValue(baseOutput);
      mockCardsService.findCardsByDefinitionIdsAndUserId.mockResolvedValue([]);

      await service.lookup({
        word: 'run',
        language: 'en',
        userId: 'user-id-1',
      });

      expect(
        mockCardsService.findCardsByDefinitionIdsAndUserId,
      ).toHaveBeenCalledWith(['def-id-1'], 'user-id-1');
    });

    it('edge case — same definition in two decks shows both decks', async () => {
      mockDictionaryService.lookup.mockResolvedValue(baseOutput);
      mockCardsService.findCardsByDefinitionIdsAndUserId.mockResolvedValue([
        { definitionId: 'def-id-1', deck: { id: 'deck-id-1', name: 'Deck A' } },
        { definitionId: 'def-id-1', deck: { id: 'deck-id-2', name: 'Deck B' } },
      ]);

      const result = await service.lookup({
        word: 'run',
        language: 'en',
        userId: 'user-id-1',
      });

      expect(result.definitions[0].decks).toHaveLength(2);
      expect(result.definitions[0].decks).toContainEqual({
        id: 'deck-id-1',
        name: 'Deck A',
      });
      expect(result.definitions[0].decks).toContainEqual({
        id: 'deck-id-2',
        name: 'Deck B',
      });
    });

    it('edge case — word not found throws DefinitionsNotFoundException (propagated from DictionaryService)', async () => {
      mockDictionaryService.lookup.mockRejectedValue(
        new DefinitionsNotFoundException('xyzabc', 'en'),
      );

      await expect(
        service.lookup({ word: 'xyzabc', language: 'en', userId: 'user-id-1' }),
      ).rejects.toBeInstanceOf(DefinitionsNotFoundException);

      expect(
        mockCardsService.findCardsByDefinitionIdsAndUserId,
      ).not.toHaveBeenCalled();
    });

    it('maps part_of_speech (snake_case) to partOfSpeech (camelCase) in the output', async () => {
      mockDictionaryService.lookup.mockResolvedValue(baseOutput);
      mockCardsService.findCardsByDefinitionIdsAndUserId.mockResolvedValue([]);

      const result = await service.lookup({
        word: 'run',
        language: 'en',
        userId: 'user-id-1',
      });

      expect(result.definitions[0].partOfSpeech).toBe('verb');
      expect(result.definitions[0]).not.toHaveProperty('part_of_speech');
    });
  });
});
