import { Test, TestingModule } from '@nestjs/testing';
import { CreateCardUseCase } from './create-card.use-case';
import { CardsService } from '../cards.service';
import { DecksPrismaService } from '../../decks/decks.prisma.service';
import {
  CardAlreadyExistsError,
  DeckOwnershipError,
  DefinitionNotFoundError,
} from '../cards.errors';
import type { Card, Definition, Word, Deck } from '@prisma/client';
import type { CreateCardDto } from '../dto/create-card.dto';

const mockDeck: Deck = {
  id: 'deck-id-1',
  userId: 'user-id-1',
  name: 'My French Deck',
  language: 'fr',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

const mockWord: Word = {
  id: 'word-id-1',
  lemma: 'run',
  language: 'en',
  ipa: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
};

const mockDefinition: Definition = {
  id: 'def-id-1',
  wordId: 'word-id-1',
  partOfSpeech: 'verb',
  definition: 'to move at a speed faster than walking',
  example: 'She runs every morning.',
  provider: 'free-dictionary',
  gapFillMetadata: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
};

const mockCard: Card = {
  id: 'card-id-1',
  deckId: 'deck-id-1',
  userId: 'user-id-1',
  definitionId: 'def-id-1',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

const mockCardWithRelations = {
  ...mockCard,
  definition: { ...mockDefinition, word: mockWord },
};

const mockCardsService = {
  create: jest.fn(),
};

const mockDecksPrismaService = {
  findOneByIdAndUserId: jest.fn(),
};

describe('CreateCardUseCase', () => {
  let useCase: CreateCardUseCase;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CreateCardUseCase,
        { provide: CardsService, useValue: mockCardsService },
        { provide: DecksPrismaService, useValue: mockDecksPrismaService },
      ],
    }).compile();

    useCase = module.get<CreateCardUseCase>(CreateCardUseCase);
  });

  it('should be defined', () => {
    expect(useCase).toBeDefined();
  });

  describe('execute()', () => {
    const dto: CreateCardDto = {
      deckId: 'deck-id-1',
      definitionId: 'def-id-1',
    };

    it('happy path — creates card and returns it with definition and word', async () => {
      mockDecksPrismaService.findOneByIdAndUserId.mockResolvedValue(mockDeck);
      mockCardsService.create.mockResolvedValue(mockCardWithRelations);

      const result = await useCase.execute('user-id-1', dto);

      expect(result).toEqual(mockCardWithRelations);
      expect(result.definition).toBeDefined();
      expect(result.definition.word).toBeDefined();
      expect(result.definition.word.lemma).toBe('run');
      expect(result.definition.word.language).toBe('en');
      expect(mockDecksPrismaService.findOneByIdAndUserId).toHaveBeenCalledWith(
        'deck-id-1',
        'user-id-1',
      );
      expect(mockCardsService.create).toHaveBeenCalledWith(
        'user-id-1',
        'deck-id-1',
        'def-id-1',
      );
    });

    it('edge case — deckId belongs to another user throws DeckOwnershipError (404)', async () => {
      mockDecksPrismaService.findOneByIdAndUserId.mockResolvedValue(null);

      await expect(
        useCase.execute('user-id-1', {
          deckId: 'deck-id-other-user',
          definitionId: 'def-id-1',
        }),
      ).rejects.toBeInstanceOf(DeckOwnershipError);

      expect(mockCardsService.create).not.toHaveBeenCalled();
    });

    it('edge case — definitionId does not exist throws DefinitionNotFoundError (propagated from CardsService)', async () => {
      mockDecksPrismaService.findOneByIdAndUserId.mockResolvedValue(mockDeck);
      mockCardsService.create.mockRejectedValue(new DefinitionNotFoundError());

      await expect(
        useCase.execute('user-id-1', {
          deckId: 'deck-id-1',
          definitionId: 'nonexistent-def',
        }),
      ).rejects.toBeInstanceOf(DefinitionNotFoundError);
    });

    it('edge case — duplicate deckId+definitionId throws CardAlreadyExistsError (propagated from CardsService)', async () => {
      mockDecksPrismaService.findOneByIdAndUserId.mockResolvedValue(mockDeck);
      mockCardsService.create.mockRejectedValue(new CardAlreadyExistsError());

      await expect(useCase.execute('user-id-1', dto)).rejects.toBeInstanceOf(
        CardAlreadyExistsError,
      );
    });
  });
});
