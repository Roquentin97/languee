import { Test, TestingModule } from '@nestjs/testing';
import { ListDecksUseCase } from './list-decks.use-case';
import { DecksPrismaService } from '../decks.prisma.service';
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
  findAllByUserId: jest.fn(),
};

describe('ListDecksUseCase', () => {
  let useCase: ListDecksUseCase;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ListDecksUseCase,
        { provide: DecksPrismaService, useValue: mockDecksPrismaService },
      ],
    }).compile();

    useCase = module.get<ListDecksUseCase>(ListDecksUseCase);
  });

  it('should be defined', () => {
    expect(useCase).toBeDefined();
  });

  describe('execute()', () => {
    it('happy path — returns all decks owned by the user', async () => {
      const decks = [
        mockDeck,
        { ...mockDeck, id: 'deck-id-2', name: 'Spanish' },
      ];
      mockDecksPrismaService.findAllByUserId.mockResolvedValue(decks);

      const result = await useCase.execute('user-id-1');

      expect(result).toEqual(decks);
      expect(mockDecksPrismaService.findAllByUserId).toHaveBeenCalledWith(
        'user-id-1',
      );
    });

    it('edge case — user with no decks returns empty array (not 404)', async () => {
      mockDecksPrismaService.findAllByUserId.mockResolvedValue([]);

      const result = await useCase.execute('user-id-99');

      expect(result).toEqual([]);
      expect(Array.isArray(result)).toBe(true);
    });

    it('edge case — only decks owned by the authenticated user are returned', async () => {
      mockDecksPrismaService.findAllByUserId.mockResolvedValue([mockDeck]);

      await useCase.execute('user-id-1');

      expect(mockDecksPrismaService.findAllByUserId).toHaveBeenCalledWith(
        'user-id-1',
      );
    });
  });
});
