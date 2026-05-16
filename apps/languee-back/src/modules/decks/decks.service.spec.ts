import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../core/prisma/prisma.service';
import { DecksService } from './decks.service';
import { DeckAlreadyExistsError, DeckNotFoundError } from './decks.errors';
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
    create: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
  },
};

describe('DecksService', () => {
  let service: DecksService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DecksService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<DecksService>(DecksService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create()', () => {
    it('happy path — creates and returns the new deck', async () => {
      mockPrismaService.deck.create.mockResolvedValue(mockDeck);

      const result = await service.create('user-id-1', 'My French Deck', 'fr');

      expect(result).toEqual(mockDeck);
      expect(mockPrismaService.deck.create).toHaveBeenCalledWith({
        data: { userId: 'user-id-1', name: 'My French Deck', language: 'fr' },
      });
    });

    it('edge case — same name for same user throws DeckAlreadyExistsError on P2002', async () => {
      const prismaError = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed',
        { code: 'P2002', clientVersion: '6.0.0' },
      );
      mockPrismaService.deck.create.mockRejectedValue(prismaError);

      await expect(
        service.create('user-id-1', 'My French Deck', 'fr'),
      ).rejects.toBeInstanceOf(DeckAlreadyExistsError);
    });

    it('edge case — different user with same deck name succeeds (no P2002)', async () => {
      const anotherUserDeck: Deck = {
        ...mockDeck,
        id: 'deck-id-2',
        userId: 'user-id-2',
      };
      mockPrismaService.deck.create.mockResolvedValue(anotherUserDeck);

      const result = await service.create('user-id-2', 'My French Deck', 'fr');

      expect(result).toEqual(anotherUserDeck);
    });

    it('edge case — unexpected error is re-thrown', async () => {
      mockPrismaService.deck.create.mockRejectedValue(
        new Error('Database connection lost'),
      );

      await expect(
        service.create('user-id-1', 'My Deck', 'fr'),
      ).rejects.toThrow('Database connection lost');
    });
  });

  describe('findAll()', () => {
    it('happy path — returns decks owned by the user', async () => {
      mockPrismaService.deck.findMany.mockResolvedValue([mockDeck]);

      const result = await service.findAll('user-id-1');

      expect(result).toEqual([mockDeck]);
      expect(mockPrismaService.deck.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-id-1' },
      });
    });

    it('edge case — user with no decks returns empty array', async () => {
      mockPrismaService.deck.findMany.mockResolvedValue([]);

      const result = await service.findAll('user-id-1');

      expect(result).toEqual([]);
    });
  });

  describe('findOneByIdAndUserId()', () => {
    it('happy path — returns deck when found', async () => {
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

    it('edge case — deck belongs to another user returns null', async () => {
      mockPrismaService.deck.findFirst.mockResolvedValue(null);

      const result = await service.findOneByIdAndUserId(
        'deck-id-1',
        'other-user',
      );

      expect(result).toBeNull();
    });
  });

  describe('findOneOrThrow()', () => {
    it('happy path — returns deck when found', async () => {
      mockPrismaService.deck.findFirst.mockResolvedValue(mockDeck);

      const result = await service.findOneOrThrow('deck-id-1', 'user-id-1');

      expect(result).toEqual(mockDeck);
    });

    it('edge case — not found or wrong user throws DeckNotFoundError', async () => {
      mockPrismaService.deck.findFirst.mockResolvedValue(null);

      await expect(
        service.findOneOrThrow('deck-id-1', 'user-id-1'),
      ).rejects.toBeInstanceOf(DeckNotFoundError);
    });
  });
});
