import { Test, TestingModule } from '@nestjs/testing';
import { LookupVocabularyUseCase } from './lookup-vocabulary.use-case';
import { LookupWordUseCase } from '../../dictionary/application/lookup-word.use-case';
import { CardsPrismaService } from '../../cards/cards.prisma.service';
import { DefinitionsNotFoundException } from '../../dictionary/dictionary.errors';

const mockLookupWordUseCase = {
  execute: jest.fn(),
};

const mockCardsPrismaService = {
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

describe('LookupVocabularyUseCase', () => {
  let useCase: LookupVocabularyUseCase;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LookupVocabularyUseCase,
        { provide: LookupWordUseCase, useValue: mockLookupWordUseCase },
        { provide: CardsPrismaService, useValue: mockCardsPrismaService },
      ],
    }).compile();

    useCase = module.get<LookupVocabularyUseCase>(LookupVocabularyUseCase);
  });

  it('should be defined', () => {
    expect(useCase).toBeDefined();
  });

  describe('execute()', () => {
    it('happy path — cache hit, user has cards for definitions, decks array is populated', async () => {
      mockLookupWordUseCase.execute.mockResolvedValue({
        ...baseOutput,
        source: 'cache',
      });
      mockCardsPrismaService.findCardsByDefinitionIdsAndUserId.mockResolvedValue(
        [
          {
            definitionId: 'def-id-1',
            deck: { id: 'deck-id-1', name: 'My Deck' },
          },
        ],
      );

      const result = await useCase.execute({
        word: 'run',
        language: 'en',
        userId: 'user-id-1',
      });

      expect(result.source).toBe('cache');
      expect(result.lemma).toBe('run');
      expect(result.definitions).toHaveLength(1);
      expect(result.definitions[0].decks).toHaveLength(1);
      expect(result.definitions[0].decks[0]).toEqual({
        id: 'deck-id-1',
        name: 'My Deck',
      });
    });

    it('happy path — provider fetch, deck enrichment still applied after persist', async () => {
      mockLookupWordUseCase.execute.mockResolvedValue({
        ...baseOutput,
        source: 'provider',
      });
      mockCardsPrismaService.findCardsByDefinitionIdsAndUserId.mockResolvedValue(
        [
          {
            definitionId: 'def-id-1',
            deck: { id: 'deck-id-1', name: 'My Deck' },
          },
        ],
      );

      const result = await useCase.execute({
        word: 'run',
        language: 'en',
        userId: 'user-id-1',
      });

      expect(result.source).toBe('provider');
      expect(result.definitions[0].decks).toHaveLength(1);
    });

    it('edge case — definition without matching card has empty decks array', async () => {
      const multiDefinitionOutput = {
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
      };
      mockLookupWordUseCase.execute.mockResolvedValue(multiDefinitionOutput);
      mockCardsPrismaService.findCardsByDefinitionIdsAndUserId.mockResolvedValue(
        [
          {
            definitionId: 'def-id-1',
            deck: { id: 'deck-id-1', name: 'My Deck' },
          },
        ],
      );

      const result = await useCase.execute({
        word: 'run',
        language: 'en',
        userId: 'user-id-1',
      });

      expect(result.definitions[0].decks).toHaveLength(1);
      expect(result.definitions[1].decks).toHaveLength(0);
      expect(result.definitions[1].decks).toEqual([]);
    });

    it('edge case — user has no cards at all, all definitions return empty decks arrays', async () => {
      mockLookupWordUseCase.execute.mockResolvedValue(baseOutput);
      mockCardsPrismaService.findCardsByDefinitionIdsAndUserId.mockResolvedValue(
        [],
      );

      const result = await useCase.execute({
        word: 'run',
        language: 'en',
        userId: 'user-id-1',
      });

      expect(result.definitions[0].decks).toEqual([]);
    });

    it('edge case — cards from another user do not appear in decks (query scoped by userId)', async () => {
      mockLookupWordUseCase.execute.mockResolvedValue(baseOutput);
      // Simulate that Prisma returns nothing because userId filter excludes other users' cards
      mockCardsPrismaService.findCardsByDefinitionIdsAndUserId.mockResolvedValue(
        [],
      );

      const result = await useCase.execute({
        word: 'run',
        language: 'en',
        userId: 'user-id-1',
      });

      expect(
        mockCardsPrismaService.findCardsByDefinitionIdsAndUserId,
      ).toHaveBeenCalledWith(['def-id-1'], 'user-id-1');
      expect(result.definitions[0].decks).toEqual([]);
    });

    it('edge case — same definition in two decks shows both decks in the decks array', async () => {
      mockLookupWordUseCase.execute.mockResolvedValue(baseOutput);
      mockCardsPrismaService.findCardsByDefinitionIdsAndUserId.mockResolvedValue(
        [
          {
            definitionId: 'def-id-1',
            deck: { id: 'deck-id-1', name: 'Deck A' },
          },
          {
            definitionId: 'def-id-1',
            deck: { id: 'deck-id-2', name: 'Deck B' },
          },
        ],
      );

      const result = await useCase.execute({
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

    it('edge case — word not found in any provider throws DefinitionsNotFoundException', async () => {
      mockLookupWordUseCase.execute.mockRejectedValue(
        new DefinitionsNotFoundException('xyzabc', 'en'),
      );

      await expect(
        useCase.execute({
          word: 'xyzabc',
          language: 'en',
          userId: 'user-id-1',
        }),
      ).rejects.toBeInstanceOf(DefinitionsNotFoundException);

      expect(
        mockCardsPrismaService.findCardsByDefinitionIdsAndUserId,
      ).not.toHaveBeenCalled();
    });

    it('maps part_of_speech (snake_case) to partOfSpeech (camelCase) in the output', async () => {
      mockLookupWordUseCase.execute.mockResolvedValue(baseOutput);
      mockCardsPrismaService.findCardsByDefinitionIdsAndUserId.mockResolvedValue(
        [],
      );

      const result = await useCase.execute({
        word: 'run',
        language: 'en',
        userId: 'user-id-1',
      });

      expect(result.definitions[0].partOfSpeech).toBe('verb');
      expect(result.definitions[0]).not.toHaveProperty('part_of_speech');
    });
  });
});
