import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../core/prisma/prisma.service';
import { DecksService } from './decks.service';
import { DeckAlreadyExistsError } from './decks.errors';
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

    it('edge case — same name for same user in different language also triggers P2002 (constraint is userId+name only)', async () => {
      // The constraint is on (userId, name) without language, so same name+user different language
      // also produces P2002 and must be surfaced as DeckAlreadyExistsError
      const prismaError = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed',
        { code: 'P2002', clientVersion: '6.0.0' },
      );
      mockPrismaService.deck.create.mockRejectedValue(prismaError);

      await expect(
        service.create('user-id-1', 'My Deck', 'en'),
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

    it('edge case — non-P2002 Prisma error is re-thrown as-is', async () => {
      const prismaError = new Prisma.PrismaClientKnownRequestError(
        'Foreign key constraint failed',
        { code: 'P2003', clientVersion: '6.0.0' },
      );
      mockPrismaService.deck.create.mockRejectedValue(prismaError);

      await expect(
        service.create('user-id-1', 'My Deck', 'fr'),
      ).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);

      await expect(
        service.create('user-id-1', 'My Deck', 'fr'),
      ).rejects.toMatchObject({ code: 'P2003' });
    });

    it('edge case — unexpected error is re-thrown', async () => {
      const unexpectedError = new Error('Database connection lost');
      mockPrismaService.deck.create.mockRejectedValue(unexpectedError);

      await expect(
        service.create('user-id-1', 'My Deck', 'fr'),
      ).rejects.toThrow('Database connection lost');
    });
  });
});
