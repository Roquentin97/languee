import { Test, TestingModule } from '@nestjs/testing';
import { ShowDeckUseCase } from './show-deck.use-case';
import { DecksPrismaService } from '../decks.prisma.service';
import { DeckNotFoundError } from '../decks.errors';
import type { Deck } from '@prisma/client';

const mockDeck: Deck = {
  id: 'deck-id-1',
  userId: 'user-id-1',
  name: 'My French Deck',
  language: 'fr',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

const mockDecksPrismaService = {
  findOneByIdAndUserId: jest.fn(),
};

describe('ShowDeckUseCase', () => {
  let useCase: ShowDeckUseCase;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ShowDeckUseCase,
        { provide: DecksPrismaService, useValue: mockDecksPrismaService },
      ],
    }).compile();

    useCase = module.get<ShowDeckUseCase>(ShowDeckUseCase);
  });

  it('should be defined', () => {
    expect(useCase).toBeDefined();
  });

  describe('execute()', () => {
    it('happy path — returns the deck when it belongs to the user', async () => {
      mockDecksPrismaService.findOneByIdAndUserId.mockResolvedValue(mockDeck);

      const result = await useCase.execute('deck-id-1', 'user-id-1');

      expect(result).toEqual(mockDeck);
      expect(mockDecksPrismaService.findOneByIdAndUserId).toHaveBeenCalledWith(
        'deck-id-1',
        'user-id-1',
      );
    });

    it('edge case — deck exists but belongs to another user throws DeckNotFoundError (not 403, avoids user enumeration)', async () => {
      mockDecksPrismaService.findOneByIdAndUserId.mockResolvedValue(null);

      await expect(
        useCase.execute('deck-id-1', 'other-user-id'),
      ).rejects.toBeInstanceOf(DeckNotFoundError);
    });

    it('edge case — deck does not exist at all throws DeckNotFoundError', async () => {
      mockDecksPrismaService.findOneByIdAndUserId.mockResolvedValue(null);

      await expect(
        useCase.execute('nonexistent-id', 'user-id-1'),
      ).rejects.toBeInstanceOf(DeckNotFoundError);
    });
  });
});
