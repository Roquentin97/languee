import { Test, TestingModule } from '@nestjs/testing';
import { CreateDeckUseCase } from './create-deck.use-case';
import { DecksService } from '../decks.service';
import { DeckAlreadyExistsError } from '../decks.errors';
import type { Deck } from '@prisma/client';
import type { CreateDeckDto } from '../dto/create-deck.dto';

const mockDeck: Deck = {
  id: 'deck-id-1',
  userId: 'user-id-1',
  name: 'My French Deck',
  language: 'fr',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

const mockDecksService = {
  create: jest.fn(),
};

describe('CreateDeckUseCase', () => {
  let useCase: CreateDeckUseCase;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CreateDeckUseCase,
        { provide: DecksService, useValue: mockDecksService },
      ],
    }).compile();

    useCase = module.get<CreateDeckUseCase>(CreateDeckUseCase);
  });

  it('should be defined', () => {
    expect(useCase).toBeDefined();
  });

  describe('execute()', () => {
    it('happy path — delegates to DecksService.create() and returns the deck', async () => {
      mockDecksService.create.mockResolvedValue(mockDeck);
      const dto: CreateDeckDto = { name: 'My French Deck', language: 'fr' };

      const result = await useCase.execute('user-id-1', dto);

      expect(result).toEqual(mockDeck);
      expect(mockDecksService.create).toHaveBeenCalledWith(
        'user-id-1',
        'My French Deck',
        'fr',
      );
    });

    it('edge case — propagates DeckAlreadyExistsError from DecksService (same name/user)', async () => {
      mockDecksService.create.mockRejectedValue(new DeckAlreadyExistsError());
      const dto: CreateDeckDto = { name: 'My French Deck', language: 'fr' };

      await expect(useCase.execute('user-id-1', dto)).rejects.toBeInstanceOf(
        DeckAlreadyExistsError,
      );
    });
  });
});
