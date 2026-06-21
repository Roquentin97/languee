import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AnkiDroidExportsController } from './ankidroid-exports.controller';
import { AnkiDroidExportsService } from './ankidroid-exports.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  CardNotFoundOrNotOwnedError,
  ExportNotFoundError,
} from './ankidroid-exports.errors';
import type { CurrentUserPayload } from '../auth/decorators/current-user.decorator';
import type {
  CardAnkiDroidExport,
  CardAnkiDroidExportAttempt,
} from '@prisma/client';
import type { Response } from 'express';

const mockUser: CurrentUserPayload = {
  userId: 'user-id-1',
  sessionId: 'session-id-1',
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

const mockAnkiDroidExportsService = {
  getOrCreateExportForCard: jest.fn(),
  findOneById: jest.fn(),
  recordAttempt: jest.fn(),
};

function makeMockResponse(): { res: Response; statusMock: jest.Mock } {
  const statusMock = jest.fn().mockReturnThis();
  return {
    res: { status: statusMock } as unknown as Response,
    statusMock,
  };
}

describe('AnkiDroidExportsController', () => {
  let controller: AnkiDroidExportsController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AnkiDroidExportsController],
      providers: [
        {
          provide: AnkiDroidExportsService,
          useValue: mockAnkiDroidExportsService,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AnkiDroidExportsController>(
      AnkiDroidExportsController,
    );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getOrCreateExport() — POST /cards/:cardId/ankidroid-exports', () => {
    it('happy path — creates new export and sets 201 status', async () => {
      mockAnkiDroidExportsService.getOrCreateExportForCard.mockResolvedValue({
        export: mockExport,
        created: true,
      });
      const { res, statusMock } = makeMockResponse();

      const result = await controller.getOrCreateExport(
        'card-id-1',
        mockUser,
        res,
      );

      expect(result).toMatchObject({
        id: 'export-id-1',
        cardId: 'card-id-1',
        status: 'pending',
      });
      expect(statusMock).toHaveBeenCalledWith(201);
      expect(
        mockAnkiDroidExportsService.getOrCreateExportForCard,
      ).toHaveBeenCalledWith('user-id-1', 'card-id-1');
    });

    it('happy path — returns existing export and sets 200 status', async () => {
      mockAnkiDroidExportsService.getOrCreateExportForCard.mockResolvedValue({
        export: mockExport,
        created: false,
      });
      const { res, statusMock } = makeMockResponse();

      const result = await controller.getOrCreateExport(
        'card-id-1',
        mockUser,
        res,
      );

      expect(result).toMatchObject({ id: 'export-id-1' });
      expect(statusMock).toHaveBeenCalledWith(200);
    });

    it('edge case — CardNotFoundOrNotOwnedError maps to 404 NotFoundException with CARD_NOT_FOUND', async () => {
      mockAnkiDroidExportsService.getOrCreateExportForCard.mockRejectedValue(
        new CardNotFoundOrNotOwnedError(),
      );
      const { res } = makeMockResponse();

      const err = await controller
        .getOrCreateExport('card-id-other', mockUser, res)
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(NotFoundException);
      expect((err as NotFoundException).getResponse()).toMatchObject({
        message: 'CARD_NOT_FOUND',
      });
    });

    it('edge case — unknown error is re-thrown', async () => {
      mockAnkiDroidExportsService.getOrCreateExportForCard.mockRejectedValue(
        new Error('Unexpected failure'),
      );
      const { res } = makeMockResponse();

      await expect(
        controller.getOrCreateExport('card-id-1', mockUser, res),
      ).rejects.toThrow('Unexpected failure');
    });

    it('serializes all export fields in the response', async () => {
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
      mockAnkiDroidExportsService.getOrCreateExportForCard.mockResolvedValue({
        export: completedExport,
        created: false,
      });
      const { res } = makeMockResponse();

      const result = await controller.getOrCreateExport(
        'card-id-1',
        mockUser,
        res,
      );

      expect(result).toMatchObject({
        status: 'completed',
        ankiNoteId: '1234567890',
        ankiDeckId: '9876543210',
        ankiDeckNameSnapshot: 'English Vocabulary',
        ankiModelId: '1122334455',
        ankiModelNameSnapshot: 'Basic',
        templateVersion: '1.0.0',
      });
    });
  });

  describe('findOne() — GET /ankidroid-exports/:id', () => {
    it('happy path — returns serialized export with attempts', async () => {
      mockAnkiDroidExportsService.findOneById.mockResolvedValue(
        mockExportWithAttempts,
      );

      const result = await controller.findOne('export-id-1', mockUser);

      expect(result).toMatchObject({
        id: 'export-id-1',
        cardId: 'card-id-1',
        status: 'pending',
      });
      expect(result.attempts).toHaveLength(1);
      expect(result.attempts[0]).toMatchObject({
        id: 'attempt-id-1',
        exportId: 'export-id-1',
        status: 'completed',
      });
      expect(mockAnkiDroidExportsService.findOneById).toHaveBeenCalledWith(
        'export-id-1',
        'user-id-1',
      );
    });

    it('edge case — export not found returns 404 NotFoundException with EXPORT_NOT_FOUND', async () => {
      mockAnkiDroidExportsService.findOneById.mockResolvedValue(null);

      const err = await controller
        .findOne('nonexistent', mockUser)
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(NotFoundException);
      expect((err as NotFoundException).getResponse()).toMatchObject({
        message: 'EXPORT_NOT_FOUND',
      });
    });

    it('edge case — export belongs to another user returns 404 NotFoundException', async () => {
      // Service returns null when ownership check fails
      mockAnkiDroidExportsService.findOneById.mockResolvedValue(null);

      await expect(
        controller.findOne('export-id-1', {
          ...mockUser,
          userId: 'other-user',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns export with empty attempts array', async () => {
      mockAnkiDroidExportsService.findOneById.mockResolvedValue({
        ...mockExport,
        attempts: [],
      });

      const result = await controller.findOne('export-id-1', mockUser);

      expect(result.attempts).toEqual([]);
    });
  });

  describe('recordAttempt() — POST /ankidroid-exports/:id/attempts', () => {
    it('happy path — records a completed attempt and returns updated export with attempts', async () => {
      mockAnkiDroidExportsService.recordAttempt.mockResolvedValue(
        mockExportWithAttempts,
      );

      const result = await controller.recordAttempt('export-id-1', mockUser, {
        status: 'completed',
        ankiNoteId: '1234567890',
        ankiDeckId: '9876543210',
        ankiDeckNameSnapshot: 'English Vocabulary',
        ankiModelId: '1122334455',
        ankiModelNameSnapshot: 'Basic',
        templateVersion: '1.0.0',
      });

      expect(result).toMatchObject({
        id: 'export-id-1',
        status: 'pending',
      });
      expect(result.attempts).toHaveLength(1);
      expect(mockAnkiDroidExportsService.recordAttempt).toHaveBeenCalledWith(
        'export-id-1',
        'user-id-1',
        expect.objectContaining({ status: 'completed' }),
      );
    });

    it('happy path — records a failed attempt with failure reason', async () => {
      const failedExportWithAttempts = {
        ...mockExport,
        status: 'failed' as const,
        failureReason: 'DECK_NOT_FOUND',
        failureMessage: 'The target AnkiDroid deck could not be found',
        attempts: [
          {
            ...mockAttempt,
            status: 'failed' as const,
            failureReason: 'DECK_NOT_FOUND',
            failureMessage: 'The target AnkiDroid deck could not be found',
          },
        ],
      };
      mockAnkiDroidExportsService.recordAttempt.mockResolvedValue(
        failedExportWithAttempts,
      );

      const result = await controller.recordAttempt('export-id-1', mockUser, {
        status: 'failed',
        failureReason: 'DECK_NOT_FOUND',
        failureMessage: 'The target AnkiDroid deck could not be found',
      });

      expect(result.attempts[0]).toMatchObject({
        status: 'failed',
        failureReason: 'DECK_NOT_FOUND',
      });
    });

    it('edge case — export not found throws 404 NotFoundException with EXPORT_NOT_FOUND', async () => {
      mockAnkiDroidExportsService.recordAttempt.mockRejectedValue(
        new ExportNotFoundError(),
      );

      const err = await controller
        .recordAttempt('nonexistent', mockUser, { status: 'completed' })
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(NotFoundException);
      expect((err as NotFoundException).getResponse()).toMatchObject({
        message: 'EXPORT_NOT_FOUND',
      });
    });

    it('edge case — export belongs to another user throws 404 NotFoundException', async () => {
      // Service throws ExportNotFoundError for ownership failure too
      mockAnkiDroidExportsService.recordAttempt.mockRejectedValue(
        new ExportNotFoundError(),
      );

      await expect(
        controller.recordAttempt('export-id-1', mockUser, {
          status: 'completed',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('edge case — completed attempt with all Anki fields optional (none provided)', async () => {
      mockAnkiDroidExportsService.recordAttempt.mockResolvedValue({
        ...mockExport,
        status: 'completed' as const,
        ankiNoteId: null,
        attempts: [],
      });

      const result = await controller.recordAttempt('export-id-1', mockUser, {
        status: 'completed',
      });

      expect(result.status).toBe('completed');
      expect(result.ankiNoteId).toBeNull();
    });

    it('edge case — unknown error is re-thrown', async () => {
      mockAnkiDroidExportsService.recordAttempt.mockRejectedValue(
        new Error('Unexpected failure'),
      );

      await expect(
        controller.recordAttempt('export-id-1', mockUser, {
          status: 'completed',
        }),
      ).rejects.toThrow('Unexpected failure');
    });
  });
});
