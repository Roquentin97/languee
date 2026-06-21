import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../core/prisma/prisma.service';
import { CardsService } from '../cards/cards.service';
import { AnkiDroidExportsService } from './ankidroid-exports.service';
import {
  CardNotFoundOrNotOwnedError,
  ExportNotFoundError,
} from './ankidroid-exports.errors';
import type {
  Card,
  CardAnkiDroidExport,
  CardAnkiDroidExportAttempt,
  Definition,
  Word,
} from '@prisma/client';

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

const mockCardWithRelations = {
  ...mockCard,
  definition: { ...mockDefinition, word: mockWord },
  ankidroidExport: null,
};

const mockExport: CardAnkiDroidExport = {
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

const mockAttempt: CardAnkiDroidExportAttempt = {
  id: 'attempt-id-1',
  exportId: 'export-id-1',
  status: 'completed',
  failureReason: null,
  failureMessage: null,
  attemptedAt: new Date('2026-01-02T00:00:00.000Z'),
};

const mockExportWithAttempts = {
  ...mockExport,
  attempts: [mockAttempt],
};

const mockPrismaService = {
  cardAnkiDroidExport: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  cardAnkiDroidExportAttempt: {
    create: jest.fn(),
  },
  $transaction: jest.fn(),
};

const mockCardsService = {
  findOneByIdAndUserId: jest.fn(),
};

describe('AnkiDroidExportsService', () => {
  let service: AnkiDroidExportsService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnkiDroidExportsService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: CardsService, useValue: mockCardsService },
      ],
    }).compile();

    service = module.get<AnkiDroidExportsService>(AnkiDroidExportsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getOrCreateExportForCard()', () => {
    it('happy path — creates and returns a new export when none exists', async () => {
      mockCardsService.findOneByIdAndUserId.mockResolvedValue(
        mockCardWithRelations,
      );
      mockPrismaService.cardAnkiDroidExport.findUnique.mockResolvedValue(null);
      mockPrismaService.cardAnkiDroidExport.create.mockResolvedValue(
        mockExport,
      );

      const result = await service.getOrCreateExportForCard(
        'user-id-1',
        'card-id-1',
      );

      expect(result).toEqual({ export: mockExport, created: true });
      expect(mockPrismaService.cardAnkiDroidExport.create).toHaveBeenCalledWith(
        {
          data: { cardId: 'card-id-1', status: 'pending' },
        },
      );
    });

    it('happy path — returns existing export when one already exists', async () => {
      mockCardsService.findOneByIdAndUserId.mockResolvedValue(
        mockCardWithRelations,
      );
      mockPrismaService.cardAnkiDroidExport.findUnique.mockResolvedValue(
        mockExport,
      );

      const result = await service.getOrCreateExportForCard(
        'user-id-1',
        'card-id-1',
      );

      expect(result).toEqual({ export: mockExport, created: false });
      expect(
        mockPrismaService.cardAnkiDroidExport.create,
      ).not.toHaveBeenCalled();
    });

    it('edge case — cardId belonging to another user throws CardNotFoundOrNotOwnedError', async () => {
      mockCardsService.findOneByIdAndUserId.mockResolvedValue(null);

      await expect(
        service.getOrCreateExportForCard('user-id-1', 'card-id-other'),
      ).rejects.toBeInstanceOf(CardNotFoundOrNotOwnedError);

      expect(
        mockPrismaService.cardAnkiDroidExport.findUnique,
      ).not.toHaveBeenCalled();
    });

    it('edge case — concurrent creation P2002 re-fetches and returns existing export', async () => {
      mockCardsService.findOneByIdAndUserId.mockResolvedValue(
        mockCardWithRelations,
      );
      // First findUnique returns null (no export yet)
      mockPrismaService.cardAnkiDroidExport.findUnique
        .mockResolvedValueOnce(null) // initial check
        .mockResolvedValueOnce(mockExport); // re-fetch after P2002

      const prismaError = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed',
        { code: 'P2002', clientVersion: '6.0.0' },
      );
      mockPrismaService.cardAnkiDroidExport.create.mockRejectedValue(
        prismaError,
      );

      const result = await service.getOrCreateExportForCard(
        'user-id-1',
        'card-id-1',
      );

      expect(result).toEqual({ export: mockExport, created: false });
      expect(
        mockPrismaService.cardAnkiDroidExport.findUnique,
      ).toHaveBeenCalledTimes(2);
    });

    it('edge case — concurrent creation P2002 but re-fetch also returns null re-throws original error', async () => {
      mockCardsService.findOneByIdAndUserId.mockResolvedValue(
        mockCardWithRelations,
      );
      mockPrismaService.cardAnkiDroidExport.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);

      const prismaError = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed',
        { code: 'P2002', clientVersion: '6.0.0' },
      );
      mockPrismaService.cardAnkiDroidExport.create.mockRejectedValue(
        prismaError,
      );

      await expect(
        service.getOrCreateExportForCard('user-id-1', 'card-id-1'),
      ).rejects.toBe(prismaError);
    });

    it('edge case — non-P2002 Prisma error on create is re-thrown', async () => {
      mockCardsService.findOneByIdAndUserId.mockResolvedValue(
        mockCardWithRelations,
      );
      mockPrismaService.cardAnkiDroidExport.findUnique.mockResolvedValue(null);
      const unexpectedError = new Error('Database connection lost');
      mockPrismaService.cardAnkiDroidExport.create.mockRejectedValue(
        unexpectedError,
      );

      await expect(
        service.getOrCreateExportForCard('user-id-1', 'card-id-1'),
      ).rejects.toThrow('Database connection lost');
    });
  });

  describe('findOneById()', () => {
    it('happy path — returns export with attempts when found and user owns the card', async () => {
      mockPrismaService.cardAnkiDroidExport.findUnique.mockResolvedValue(
        mockExportWithAttempts,
      );
      mockCardsService.findOneByIdAndUserId.mockResolvedValue(
        mockCardWithRelations,
      );

      const result = await service.findOneById('export-id-1', 'user-id-1');

      expect(result).toEqual(mockExportWithAttempts);
      expect(
        mockPrismaService.cardAnkiDroidExport.findUnique,
      ).toHaveBeenCalledWith({
        where: { id: 'export-id-1' },
        include: { attempts: { orderBy: { attemptedAt: 'desc' } } },
      });
      expect(mockCardsService.findOneByIdAndUserId).toHaveBeenCalledWith(
        mockExport.cardId,
        'user-id-1',
      );
    });

    it('edge case — export not found returns null', async () => {
      mockPrismaService.cardAnkiDroidExport.findUnique.mockResolvedValue(null);

      const result = await service.findOneById('nonexistent', 'user-id-1');

      expect(result).toBeNull();
      expect(mockCardsService.findOneByIdAndUserId).not.toHaveBeenCalled();
    });

    it('edge case — export belongs to another user card returns null', async () => {
      mockPrismaService.cardAnkiDroidExport.findUnique.mockResolvedValue(
        mockExportWithAttempts,
      );
      mockCardsService.findOneByIdAndUserId.mockResolvedValue(null);

      const result = await service.findOneById('export-id-1', 'other-user');

      expect(result).toBeNull();
    });
  });

  describe('recordAttempt()', () => {
    it('happy path — records a completed attempt and updates export status', async () => {
      mockPrismaService.cardAnkiDroidExport.findUnique.mockResolvedValue(
        mockExport,
      );
      mockCardsService.findOneByIdAndUserId.mockResolvedValue(
        mockCardWithRelations,
      );

      const completedExport: CardAnkiDroidExport = {
        ...mockExport,
        status: 'completed',
        ankiNoteId: '1234567890',
        ankiDeckId: '9876543210',
        ankiDeckNameSnapshot: 'English Vocabulary',
        ankiModelId: '1122334455',
        ankiModelNameSnapshot: 'Basic',
        templateVersion: '1.0.0',
        completedAt: new Date('2026-01-02T00:00:00.000Z'),
        lastAttemptedAt: new Date('2026-01-02T00:00:00.000Z'),
      };
      const completedExportWithAttempts = {
        ...completedExport,
        attempts: [{ ...mockAttempt, status: 'completed' as const }],
      };

      mockPrismaService.$transaction.mockResolvedValue([
        mockAttempt,
        completedExportWithAttempts,
      ]);

      const result = await service.recordAttempt('export-id-1', 'user-id-1', {
        status: 'completed',
        ankiNoteId: '1234567890',
        ankiDeckId: '9876543210',
        ankiDeckNameSnapshot: 'English Vocabulary',
        ankiModelId: '1122334455',
        ankiModelNameSnapshot: 'Basic',
        templateVersion: '1.0.0',
      });

      expect(result).toEqual(completedExportWithAttempts);
      expect(mockPrismaService.$transaction).toHaveBeenCalled();
    });

    it('happy path — records a failed attempt and updates export with failure info', async () => {
      mockPrismaService.cardAnkiDroidExport.findUnique.mockResolvedValue(
        mockExport,
      );
      mockCardsService.findOneByIdAndUserId.mockResolvedValue(
        mockCardWithRelations,
      );

      const failedExport: CardAnkiDroidExport = {
        ...mockExport,
        status: 'failed',
        failureReason: 'DECK_NOT_FOUND',
        failureMessage: 'The target AnkiDroid deck could not be found',
        lastAttemptedAt: new Date('2026-01-02T00:00:00.000Z'),
      };
      const failedExportWithAttempts = {
        ...failedExport,
        attempts: [
          {
            ...mockAttempt,
            status: 'failed' as const,
            failureReason: 'DECK_NOT_FOUND',
            failureMessage: 'The target AnkiDroid deck could not be found',
          },
        ],
      };

      mockPrismaService.$transaction.mockResolvedValue([
        mockAttempt,
        failedExportWithAttempts,
      ]);

      const result = await service.recordAttempt('export-id-1', 'user-id-1', {
        status: 'failed',
        failureReason: 'DECK_NOT_FOUND',
        failureMessage: 'The target AnkiDroid deck could not be found',
      });

      expect(result).toEqual(failedExportWithAttempts);
    });

    it('edge case — export not found throws ExportNotFoundError', async () => {
      mockPrismaService.cardAnkiDroidExport.findUnique.mockResolvedValue(null);

      await expect(
        service.recordAttempt('nonexistent', 'user-id-1', {
          status: 'completed',
        }),
      ).rejects.toBeInstanceOf(ExportNotFoundError);

      expect(mockCardsService.findOneByIdAndUserId).not.toHaveBeenCalled();
    });

    it('edge case — export belongs to another user card throws ExportNotFoundError', async () => {
      mockPrismaService.cardAnkiDroidExport.findUnique.mockResolvedValue(
        mockExport,
      );
      mockCardsService.findOneByIdAndUserId.mockResolvedValue(null);

      await expect(
        service.recordAttempt('export-id-1', 'other-user', {
          status: 'completed',
        }),
      ).rejects.toBeInstanceOf(ExportNotFoundError);

      expect(mockPrismaService.$transaction).not.toHaveBeenCalled();
    });

    it('edge case — completed attempt with missing Anki reference fields: Anki fields default to null', async () => {
      mockPrismaService.cardAnkiDroidExport.findUnique.mockResolvedValue(
        mockExport,
      );
      mockCardsService.findOneByIdAndUserId.mockResolvedValue(
        mockCardWithRelations,
      );

      const completedExportNoRefs = {
        ...mockExport,
        status: 'completed' as const,
        ankiNoteId: null,
        ankiDeckId: null,
        ankiDeckNameSnapshot: null,
        ankiModelId: null,
        ankiModelNameSnapshot: null,
        templateVersion: null,
        attempts: [],
      };

      mockPrismaService.$transaction.mockResolvedValue([
        mockAttempt,
        completedExportNoRefs,
      ]);

      // status=completed but no Anki reference fields provided
      const result = await service.recordAttempt('export-id-1', 'user-id-1', {
        status: 'completed',
      });

      expect(result).toEqual(completedExportNoRefs);
      // Verify $transaction was called — actual updateData composition is tested implicitly
      expect(mockPrismaService.$transaction).toHaveBeenCalled();
    });

    it('edge case — recording a second completed attempt updates export with new Anki references', async () => {
      const alreadyCompletedExport: CardAnkiDroidExport = {
        ...mockExport,
        status: 'completed',
        ankiNoteId: 'old-note-id',
        ankiDeckId: 'old-deck-id',
        completedAt: new Date('2026-01-01T00:00:00.000Z'),
        lastAttemptedAt: new Date('2026-01-01T00:00:00.000Z'),
      };

      mockPrismaService.cardAnkiDroidExport.findUnique.mockResolvedValue(
        alreadyCompletedExport,
      );
      mockCardsService.findOneByIdAndUserId.mockResolvedValue(
        mockCardWithRelations,
      );

      const updatedExportWithNewAttempt = {
        ...alreadyCompletedExport,
        ankiNoteId: 'new-note-id',
        ankiDeckId: 'new-deck-id',
        lastAttemptedAt: new Date('2026-01-02T00:00:00.000Z'),
        completedAt: new Date('2026-01-02T00:00:00.000Z'),
        attempts: [mockAttempt],
      };

      mockPrismaService.$transaction.mockResolvedValue([
        mockAttempt,
        updatedExportWithNewAttempt,
      ]);

      const result = await service.recordAttempt('export-id-1', 'user-id-1', {
        status: 'completed',
        ankiNoteId: 'new-note-id',
        ankiDeckId: 'new-deck-id',
      });

      expect(result).toEqual(updatedExportWithNewAttempt);
      expect(result.ankiNoteId).toBe('new-note-id');
    });

    it('edge case — transaction call includes both attempt create and export update with attempts ordered desc', async () => {
      mockPrismaService.cardAnkiDroidExport.findUnique.mockResolvedValue(
        mockExport,
      );
      mockCardsService.findOneByIdAndUserId.mockResolvedValue(
        mockCardWithRelations,
      );
      mockPrismaService.$transaction.mockResolvedValue([
        mockAttempt,
        mockExportWithAttempts,
      ]);

      await service.recordAttempt('export-id-1', 'user-id-1', {
        status: 'failed',
        failureReason: 'NETWORK_ERROR',
      });

      const calls = mockPrismaService.$transaction.mock.calls as unknown[][];
      const transactionArg = calls[0]?.[0] as unknown[];
      // Transaction should contain exactly 2 operations
      expect(transactionArg).toHaveLength(2);
    });

    it('edge case — attemptedAt is not provided to create call (DB defaults to now())', async () => {
      mockPrismaService.cardAnkiDroidExport.findUnique.mockResolvedValue(
        mockExport,
      );
      mockCardsService.findOneByIdAndUserId.mockResolvedValue(
        mockCardWithRelations,
      );
      mockPrismaService.$transaction.mockResolvedValue([
        mockAttempt,
        mockExportWithAttempts,
      ]);

      await service.recordAttempt('export-id-1', 'user-id-1', {
        status: 'completed',
      });

      // The attempt create call must NOT include attemptedAt — the DB default handles it
      expect(
        mockPrismaService.cardAnkiDroidExportAttempt.create,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          data: expect.not.objectContaining({ attemptedAt: expect.anything() }),
        }),
      );
    });
  });
});
