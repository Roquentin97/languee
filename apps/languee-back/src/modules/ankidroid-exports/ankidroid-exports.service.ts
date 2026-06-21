import { Injectable } from '@nestjs/common';
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly cardsService: CardsService,
  ) {}

  async getOrCreateExportForCard(
    userId: string,
    cardId: string,
  ): Promise<{ export: CardAnkiDroidExport; created: boolean }> {
    const card = await this.cardsService.findOneByIdAndUserId(cardId, userId);
    if (card === null) {
      throw new CardNotFoundOrNotOwnedError();
    }

    const existing = await this.prisma.cardAnkiDroidExport.findUnique({
      where: { cardId },
    });
    if (existing !== null) {
      return { export: existing, created: false };
    }

    try {
      const created = await this.prisma.cardAnkiDroidExport.create({
        data: { cardId, status: 'pending' },
      });
      return { export: created, created: true };
    } catch (err: unknown) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
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

    return updatedExport;
  }
}
