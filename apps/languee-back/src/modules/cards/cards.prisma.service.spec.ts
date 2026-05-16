import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../core/prisma/prisma.service';
import { CardsPrismaService } from './cards.prisma.service';

const mockPrismaService = {
  card: {
    findMany: jest.fn(),
  },
};

describe('CardsPrismaService', () => {
  let service: CardsPrismaService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CardsPrismaService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<CardsPrismaService>(CardsPrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findCardsByDefinitionIdsAndUserId()', () => {
    it('happy path — returns cards with their deck refs for matching definitions and user', async () => {
      const cards = [
        {
          definitionId: 'def-id-1',
          deck: { id: 'deck-id-1', name: 'My Deck' },
        },
        {
          definitionId: 'def-id-2',
          deck: { id: 'deck-id-2', name: 'Other Deck' },
        },
      ];
      mockPrismaService.card.findMany.mockResolvedValue(cards);

      const result = await service.findCardsByDefinitionIdsAndUserId(
        ['def-id-1', 'def-id-2'],
        'user-id-1',
      );

      expect(result).toEqual(cards);
      expect(mockPrismaService.card.findMany).toHaveBeenCalledWith({
        where: {
          definitionId: { in: ['def-id-1', 'def-id-2'] },
          userId: 'user-id-1',
        },
        select: {
          definitionId: true,
          deck: { select: { id: true, name: true } },
        },
      });
    });

    it('edge case — user has no cards returns empty array', async () => {
      mockPrismaService.card.findMany.mockResolvedValue([]);

      const result = await service.findCardsByDefinitionIdsAndUserId(
        ['def-id-1'],
        'user-id-99',
      );

      expect(result).toEqual([]);
    });

    it('edge case — query is scoped to userId, cards of other users are not returned', async () => {
      mockPrismaService.card.findMany.mockResolvedValue([]);

      await service.findCardsByDefinitionIdsAndUserId(
        ['def-id-1'],
        'user-id-1',
      );

      expect(mockPrismaService.card.findMany).toHaveBeenCalledWith({
        where: { definitionId: { in: ['def-id-1'] }, userId: 'user-id-1' },
        select: {
          definitionId: true,
          deck: { select: { id: true, name: true } },
        },
      });
    });

    it('edge case — same definition in two decks returns two separate card records', async () => {
      const cards = [
        { definitionId: 'def-id-1', deck: { id: 'deck-id-1', name: 'Deck A' } },
        { definitionId: 'def-id-1', deck: { id: 'deck-id-2', name: 'Deck B' } },
      ];
      mockPrismaService.card.findMany.mockResolvedValue(cards);

      const result = await service.findCardsByDefinitionIdsAndUserId(
        ['def-id-1'],
        'user-id-1',
      );

      expect(result).toHaveLength(2);
      expect(result[0].deck.name).toBe('Deck A');
      expect(result[1].deck.name).toBe('Deck B');
    });
  });
});
