import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  CardAnkiDroidExport,
  CardAnkiDroidExportAttempt,
} from '@prisma/client';
import { PrismaService } from '../core/prisma/prisma.service';
import { CardsService } from '../cards/cards.service';
import {
  CardNotFoundOrNotOwnedError,
  ExportNotFoundError,
} from './ankidroid-exports.errors';
import type { RecordAttemptDto } from './dto/create-export-attempt.dto';

export type ExportWithAttempts = CardAnkiDroidExport & {
  attempts: CardAnkiDroidExportAttempt[];
};

@Injectable()
export class AnkiDroidExportsService {
  private readonly logger = new Logger(AnkiDroidExportsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cardsService: CardsService,
  ) {}

  async getOrCreateExportForCard(
    userId: string,
    cardId: string,
  ): Promise<{ export: CardAnkiDroidExport; created: boolean }> {
    const card = await this.cardsService.findOneByIdAndUserId(cardId, userId);
    this.logger.debug({
      message: 'card ownership check',
      event: 'ankidroid.card_ownership_check',
      method: this.getOrCreateExportForCard.name,
      data: { cardId, userId, found: card !== null },
    });
    if (card === null) {
      throw new CardNotFoundOrNotOwnedError();
    }

    const existing = await this.prisma.cardAnkiDroidExport.findUnique({
      where: { cardId },
    });
    if (existing !== null) {
      this.logger.log({
        message: 'export record found',
        event: 'ankidroid.export_record_found',
        method: this.getOrCreateExportForCard.name,
        data: { exportId: existing.id, cardId, status: existing.status },
      });
      return { export: existing, created: false };
    }

    try {
      const created = await this.prisma.cardAnkiDroidExport.create({
        data: { cardId, status: 'pending' },
      });
      this.logger.log({
        message: 'export record created',
        event: 'ankidroid.export_record_created',
        method: this.getOrCreateExportForCard.name,
        data: { exportId: created.id, cardId },
      });
      return { export: created, created: true };
    } catch (err: unknown) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        this.logger.warn({
          message: 'concurrent creation detected',
          event: 'ankidroid.concurrent_creation',
          method: this.getOrCreateExportForCard.name,
          data: { cardId },
        });
        // Concurrent creation — re-fetch the existing record
        const refetched = await this.prisma.cardAnkiDroidExport.findUnique({
          where: { cardId },
        });
        if (refetched === null) {
          throw err;
        }
        return { export: refetched, created: false };
      }
      throw err;
    }
  }

  async findOneById(
    exportId: string,
    userId: string,
  ): Promise<ExportWithAttempts | null> {
    const record = await this.prisma.cardAnkiDroidExport.findUnique({
      where: { id: exportId },
      include: { attempts: { orderBy: { attemptedAt: 'desc' } } },
    });

    if (record === null) {
      return null;
    }

    const card = await this.cardsService.findOneByIdAndUserId(
      record.cardId,
      userId,
    );
    if (card === null) {
      return null;
    }

    return record;
  }

  async recordAttempt(
    exportId: string,
    userId: string,
    dto: RecordAttemptDto,
  ): Promise<ExportWithAttempts> {
    const record = await this.prisma.cardAnkiDroidExport.findUnique({
      where: { id: exportId },
    });

    if (record === null) {
      throw new ExportNotFoundError();
    }

    const card = await this.cardsService.findOneByIdAndUserId(
      record.cardId,
      userId,
    );
    if (card === null) {
      throw new ExportNotFoundError();
    }

    const now = new Date();

    const updateData: Prisma.CardAnkiDroidExportUpdateInput =
      dto.status === 'completed'
        ? {
            status: 'completed',
            failureReason: null,
            failureMessage: null,
            ankiNoteId: dto.ankiNoteId ?? null,
            ankiDeckId: dto.ankiDeckId ?? null,
            ankiDeckNameSnapshot: dto.ankiDeckNameSnapshot ?? null,
            ankiModelId: dto.ankiModelId ?? null,
            ankiModelNameSnapshot: dto.ankiModelNameSnapshot ?? null,
            templateVersion: dto.templateVersion ?? null,
            lastAttemptedAt: now,
            completedAt: now,
          }
        : {
            status: 'failed',
            failureReason: dto.failureReason ?? null,
            failureMessage: dto.failureMessage ?? null,
            lastAttemptedAt: now,
          };

    const [, updatedExport] = await this.prisma.$transaction([
      this.prisma.cardAnkiDroidExportAttempt.create({
        data: {
          exportId,
          status: dto.status,
          failureReason: dto.failureReason ?? null,
          failureMessage: dto.failureMessage ?? null,
        },
      }),
      this.prisma.cardAnkiDroidExport.update({
        where: { id: exportId },
        data: updateData,
        include: { attempts: { orderBy: { attemptedAt: 'desc' } } },
      }),
    ]);

    if (dto.status === 'completed') {
      this.logger.log({
        message: 'export completed',
        event: 'ankidroid.export_completed',
        method: this.recordAttempt.name,
        data: {
          exportId,
          ankiNoteId: dto.ankiNoteId,
          ankiDeckId: dto.ankiDeckId,
        },
      });
    } else {
      this.logger.log({
        message: 'export attempt failed',
        event: 'ankidroid.export_attempt_failed',
        method: this.recordAttempt.name,
        data: {
          exportId,
          failureReason: dto.failureReason,
          failureMessage: dto.failureMessage,
        },
      });
    }

    return updatedExport;
  }
}
