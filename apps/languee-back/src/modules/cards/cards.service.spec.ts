import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../core/prisma/prisma.service';
import { DecksService } from '../decks/decks.service';
import { CardsService } from './cards.service';
import {
  CardAlreadyExistsError,
  DeckOwnershipError,
  DefinitionNotFoundError,
} from './cards.errors';
import type {
  Card,
  CardAnkiDroidExport,
  Definition,
  Word,
  Deck,
} from '@prisma/client';

const mockDeck: Deck = {
  id: 'deck-id-1',
  userId: 'user-id-1',
  name: 'My Deck',
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
  hasIrregularForms: false,
  inflectionForms: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
};

const mockCard: Card = {
  id: 'card-id-1',
  deckId: 'deck-id-1',
  userId: 'user-id-1',
  definitionId: 'def-id-1',
  context: null,
  inflectionForms: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

const mockAnkiDroidExport: CardAnkiDroidExport = {
  id: 'export-id-1',
  cardId: 'card-id-1',
  status: 'pending',
  failureReason: null,
  failureMessage: null,
  ankiNoteId: null,
  ankiDeckId: null,
  ankiDeckNameSnapshot: null,
  ankiModelId: null,
  ankiModelNameSnapshot: null,
  templateVersion: null,
  lastAttemptedAt: null,
  completedAt: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

const mockCardWithRelations = {
  ...mockCard,
  definition: { ...mockDefinition, word: mockWord },
};

const mockCardWithAnkiDroidExport = {
  ...mockCard,
  definition: { ...mockDefinition, word: mockWord },
  ankidroidExport: null,
};

const mockCardWithExportPresent = {
  ...mockCard,
  definition: { ...mockDefinition, word: mockWord },
  ankidroidExport: mockAnkiDroidExport,
};

const mockPrismaService = {
  card: {
    create: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
  },
};

const mockDecksService = {
  findOneByIdAndUserId: jest.fn(),
};

describe('CardsService', () => {
  let service: CardsService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CardsService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: DecksService, useValue: mockDecksService },
      ],
    }).compile();

    service = module.get<CardsService>(CardsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create()', () => {
    it('happy path — returns card with definition and word relations', async () => {
      mockDecksService.findOneByIdAndUserId.mockResolvedValue(mockDeck);
      mockPrismaService.card.create.mockResolvedValue(mockCardWithRelations);

      const result = await service.create('user-id-1', 'deck-id-1', 'def-id-1');

      expect(result).toEqual(mockCardWithRelations);
      expect(result.definition.word.lemma).toBe('run');
      expect(mockDecksService.findOneByIdAndUserId).toHaveBeenCalledWith(
        'deck-id-1',
        'user-id-1',
      );
      expect(mockPrismaService.card.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-id-1',
          deckId: 'deck-id-1',
          definitionId: 'def-id-1',
          context: null,
          inflectionForms: Prisma.JsonNull,
        },
        include: { definition: { include: { word: true } } },
      });
    });

    it('happy path — context and inflectionForms are persisted when provided', async () => {
      const context = 'She walked to the store.';
      const inflectionForms = { base: 'walk', past: 'walked' };
      mockDecksService.findOneByIdAndUserId.mockResolvedValue(mockDeck);
      mockPrismaService.card.create.mockResolvedValue(mockCardWithRelations);

      await service.create(
        'user-id-1',
        'deck-id-1',
        'def-id-1',
        context,
        inflectionForms,
      );

      expect(mockPrismaService.card.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-id-1',
          deckId: 'deck-id-1',
          definitionId: 'def-id-1',
          context,
          inflectionForms,
        },
        include: { definition: { include: { word: true } } },
      });
    });

    it('edge case — deckId belongs to another user throws DeckOwnershipError', async () => {
      mockDecksService.findOneByIdAndUserId.mockResolvedValue(null);

      await expect(
        service.create('user-id-1', 'deck-id-other', 'def-id-1'),
      ).rejects.toBeInstanceOf(DeckOwnershipError);

      expect(mockPrismaService.card.create).not.toHaveBeenCalled();
    });

    it('edge case — duplicate deckId+definitionId throws CardAlreadyExistsError on P2002', async () => {
      mockDecksService.findOneByIdAndUserId.mockResolvedValue(mockDeck);
      const prismaError = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed',
        { code: 'P2002', clientVersion: '6.0.0' },
      );
      mockPrismaService.card.create.mockRejectedValue(prismaError);

      await expect(
        service.create('user-id-1', 'deck-id-1', 'def-id-1'),
      ).rejects.toBeInstanceOf(CardAlreadyExistsError);
    });

    it('edge case — missing definitionId FK (P2003 with definition_id) throws DefinitionNotFoundError', async () => {
      mockDecksService.findOneByIdAndUserId.mockResolvedValue(mockDeck);
      const prismaError = new Prisma.PrismaClientKnownRequestError(
        'Foreign key constraint failed',
        {
          code: 'P2003',
          clientVersion: '6.0.0',
          meta: { field_name: 'cards_definition_id_fkey (index)' },
        },
      );
      mockPrismaService.card.create.mockRejectedValue(prismaError);

      await expect(
        service.create('user-id-1', 'deck-id-1', 'nonexistent-def'),
      ).rejects.toBeInstanceOf(DefinitionNotFoundError);
    });

    it('edge case — P2003 without definition_id in field_name throws DeckOwnershipError', async () => {
      mockDecksService.findOneByIdAndUserId.mockResolvedValue(mockDeck);
      const prismaError = new Prisma.PrismaClientKnownRequestError(
        'Foreign key constraint failed',
        {
          code: 'P2003',
          clientVersion: '6.0.0',
          meta: {},
        },
      );
      mockPrismaService.card.create.mockRejectedValue(prismaError);

      await expect(
        service.create('user-id-1', 'deck-id-1', 'def-id-1'),
      ).rejects.toBeInstanceOf(DeckOwnershipError);
    });

    it('edge case — unexpected error is re-thrown', async () => {
      mockDecksService.findOneByIdAndUserId.mockResolvedValue(mockDeck);
      mockPrismaService.card.create.mockRejectedValue(
        new Error('Network failure'),
      );

      await expect(
        service.create('user-id-1', 'deck-id-1', 'def-id-1'),
      ).rejects.toThrow('Network failure');
    });
  });

  describe('findManyByUserId()', () => {
    it('happy path — returns all cards for user with no filters', async () => {
      mockPrismaService.card.findMany.mockResolvedValue([
        mockCardWithAnkiDroidExport,
      ]);

      const result = await service.findManyByUserId('user-id-1');

      expect(result).toEqual([mockCardWithAnkiDroidExport]);
      expect(mockPrismaService.card.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-id-1' },
        include: {
          definition: { include: { word: true } },
          ankidroidExport: true,
        },
      });
    });

    it('filter — deckId adds deckId to where clause', async () => {
      mockPrismaService.card.findMany.mockResolvedValue([
        mockCardWithAnkiDroidExport,
      ]);

      await service.findManyByUserId('user-id-1', { deckId: 'deck-id-1' });

      expect(mockPrismaService.card.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          where: expect.objectContaining({
            userId: 'user-id-1',
            deckId: 'deck-id-1',
          }),
        }),
      );
    });

    it('filter — ankiDroidExportStatus=none uses Prisma is:null relation filter', async () => {
      mockPrismaService.card.findMany.mockResolvedValue([
        mockCardWithAnkiDroidExport,
      ]);

      await service.findManyByUserId('user-id-1', {
        ankiDroidExportStatus: 'none',
      });

      expect(mockPrismaService.card.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          where: expect.objectContaining({
            userId: 'user-id-1',
            ankidroidExport: { is: null },
          }),
        }),
      );
    });

    it('filter — ankiDroidExportStatus=pending filters by status in ankidroidExport relation', async () => {
      mockPrismaService.card.findMany.mockResolvedValue([
        mockCardWithExportPresent,
      ]);

      await service.findManyByUserId('user-id-1', {
        ankiDroidExportStatus: 'pending',
      });

      expect(mockPrismaService.card.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          where: expect.objectContaining({
            userId: 'user-id-1',
            ankidroidExport: { is: { status: 'pending' } },
          }),
        }),
      );
    });

    it('filter — ankiDroidExportStatus=failed with failureReason combines both filters', async () => {
      mockPrismaService.card.findMany.mockResolvedValue([]);

      await service.findManyByUserId('user-id-1', {
        ankiDroidExportStatus: 'failed',
        failureReason: 'DECK_NOT_FOUND',
      });

      expect(mockPrismaService.card.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          where: expect.objectContaining({
            userId: 'user-id-1',
            ankidroidExport: {
              is: { status: 'failed', failureReason: 'DECK_NOT_FOUND' },
            },
          }),
        }),
      );
    });

    it('filter — failureReason without ankiDroidExportStatus applies failureReason filter on relation', async () => {
      mockPrismaService.card.findMany.mockResolvedValue([]);

      await service.findManyByUserId('user-id-1', {
        failureReason: 'DECK_NOT_FOUND',
      });

      expect(mockPrismaService.card.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          where: expect.objectContaining({
            userId: 'user-id-1',
            ankidroidExport: { is: { failureReason: 'DECK_NOT_FOUND' } },
          }),
        }),
      );
    });

    it('edge case — no cards returns empty array', async () => {
      mockPrismaService.card.findMany.mockResolvedValue([]);

      const result = await service.findManyByUserId('user-id-1');

      expect(result).toEqual([]);
    });

    it('edge case — ankiDroidExportStatus=none ignores failureReason (none means no export)', async () => {
      mockPrismaService.card.findMany.mockResolvedValue([]);

      await service.findManyByUserId('user-id-1', {
        ankiDroidExportStatus: 'none',
        failureReason: 'DECK_NOT_FOUND',
      });

      // 'none' takes priority: ankidroidExport should be { is: null }
      // not combined with failureReason since no export means no failure
      expect(mockPrismaService.card.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          where: expect.objectContaining({
            ankidroidExport: { is: null },
          }),
        }),
      );
    });
  });

  describe('findOneByIdAndUserId()', () => {
    it('happy path — returns card with definition, word, and ankidroidExport when found', async () => {
      mockPrismaService.card.findFirst.mockResolvedValue(
        mockCardWithAnkiDroidExport,
      );

      const result = await service.findOneByIdAndUserId(
        'card-id-1',
        'user-id-1',
      );

      expect(result).toEqual(mockCardWithAnkiDroidExport);
      expect(mockPrismaService.card.findFirst).toHaveBeenCalledWith({
        where: { id: 'card-id-1', userId: 'user-id-1' },
        include: {
          definition: { include: { word: true } },
          ankidroidExport: true,
        },
      });
    });

    it('edge case — card belongs to another user returns null', async () => {
      mockPrismaService.card.findFirst.mockResolvedValue(null);

      const result = await service.findOneByIdAndUserId(
        'card-id-1',
        'other-user',
      );

      expect(result).toBeNull();
    });

    it('edge case — card not found returns null', async () => {
      mockPrismaService.card.findFirst.mockResolvedValue(null);

      const result = await service.findOneByIdAndUserId(
        'nonexistent-card',
        'user-id-1',
      );

      expect(result).toBeNull();
    });

    it('includes ankidroidExport in result when export exists', async () => {
      mockPrismaService.card.findFirst.mockResolvedValue(
        mockCardWithExportPresent,
      );

      const result = await service.findOneByIdAndUserId(
        'card-id-1',
        'user-id-1',
      );

      expect(result?.ankidroidExport).toEqual(mockAnkiDroidExport);
    });
  });

  describe('findCardsByDefinitionIdsAndUserId()', () => {
    it('happy path — returns cards with deck info for the given definitions and user', async () => {
      const mockResult = [
        {
          definitionId: 'def-id-1',
          deck: { id: 'deck-id-1', name: 'My Deck' },
        },
      ];
      mockPrismaService.card.findMany.mockResolvedValue(mockResult);

      const result = await service.findCardsByDefinitionIdsAndUserId(
        ['def-id-1'],
        'user-id-1',
      );

      expect(result).toEqual(mockResult);
      expect(mockPrismaService.card.findMany).toHaveBeenCalledWith({
        where: { definitionId: { in: ['def-id-1'] }, userId: 'user-id-1' },
        select: {
          definitionId: true,
          deck: { select: { id: true, name: true } },
        },
      });
    });

    it('edge case — no cards for user returns empty array', async () => {
      mockPrismaService.card.findMany.mockResolvedValue([]);

      const result = await service.findCardsByDefinitionIdsAndUserId(
        ['def-id-1'],
        'user-id-1',
      );

      expect(result).toEqual([]);
    });
  });
});
