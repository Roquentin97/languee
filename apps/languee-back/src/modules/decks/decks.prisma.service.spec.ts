import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../core/prisma/prisma.service';
import { DecksPrismaService } from './decks.prisma.service';
import type { Deck } from '@prisma/client';

const mockDeck: Deck = {
  id: 'deck-id-1',
  userId: 'user-id-1',
  name: 'My French Deck',
  language: 'fr',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

const mockPrismaService = {
  deck: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
  },
};

describe('DecksPrismaService', () => {
  let service: DecksPrismaService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DecksPrismaService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<DecksPrismaService>(DecksPrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAllByUserId()', () => {
    it('happy path — returns all decks for the given user', async () => {
      const decks = [
        mockDeck,
        { ...mockDeck, id: 'deck-id-2', name: 'Spanish' },
      ];
      mockPrismaService.deck.findMany.mockResolvedValue(decks);

      const result = await service.findAllByUserId('user-id-1');

      expect(result).toEqual(decks);
      expect(mockPrismaService.deck.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-id-1' },
      });
    });

    it('edge case — user with no decks returns empty array (not 404)', async () => {
      mockPrismaService.deck.findMany.mockResolvedValue([]);

      const result = await service.findAllByUserId('user-id-99');

      expect(result).toEqual([]);
      expect(Array.isArray(result)).toBe(true);
    });

    it('edge case — only returns decks for the requested userId, not other users', async () => {
      mockPrismaService.deck.findMany.mockResolvedValue([mockDeck]);

      await service.findAllByUserId('user-id-1');

      expect(mockPrismaService.deck.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-id-1' },
      });
      // ensure another user's id was not leaked into the query
      expect(mockPrismaService.deck.findMany).not.toHaveBeenCalledWith({
        where: { userId: 'user-id-2' },
      });
    });
  });

  describe('findOneByIdAndUserId()', () => {
    it('happy path — returns the deck when id and userId match', async () => {
      mockPrismaService.deck.findFirst.mockResolvedValue(mockDeck);

      const result = await service.findOneByIdAndUserId(
        'deck-id-1',
        'user-id-1',
      );

      expect(result).toEqual(mockDeck);
      expect(mockPrismaService.deck.findFirst).toHaveBeenCalledWith({
        where: { id: 'deck-id-1', userId: 'user-id-1' },
      });
    });

    it('edge case — returns null when deck exists but belongs to another user', async () => {
      mockPrismaService.deck.findFirst.mockResolvedValue(null);

      const result = await service.findOneByIdAndUserId(
        'deck-id-1',
        'other-user-id',
      );

      expect(result).toBeNull();
    });

    it('edge case — returns null when deck does not exist at all', async () => {
      mockPrismaService.deck.findFirst.mockResolvedValue(null);

      const result = await service.findOneByIdAndUserId(
        'nonexistent-id',
        'user-id-1',
      );

      expect(result).toBeNull();
    });
  });
});
