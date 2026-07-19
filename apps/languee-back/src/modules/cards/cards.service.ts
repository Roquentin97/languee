import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  Card,
  CardAnkiDroidExport,
  Definition,
  Word,
} from '@prisma/client';
import { PrismaService } from '../core/prisma/prisma.service';
import { DecksService } from '../decks/decks.service';
import { DeckNotFoundError } from '../decks/decks.errors';
import {
  CardAlreadyExistsError,
  CardNotFoundError,
  DefinitionNotFoundError,
} from './cards.errors';

export type CardWithDefinitionAndWord = Card & {
  definition: Definition & { word: Word };
};

export type CardWithAnkiDroidExport = Card & {
  definition: Definition & { word: Word };
  ankidroidExport: CardAnkiDroidExport | null;
};

@Injectable()
export class CardsService {
  private readonly logger = new Logger(CardsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly decksService: DecksService,
  ) {}

  async create(
    userId: string,
    deckId: string,
    definitionId: string,
    context?: string,
    inflectionForms?: Record<string, string> | null,
  ): Promise<CardWithDefinitionAndWord> {
    await this.decksService.findOneOrThrow(deckId, userId);

    try {
      const result = await this.prisma.card.create({
        data: {
          userId,
          deckId,
          definitionId,
          context: context ?? null,
          inflectionForms: inflectionForms ?? Prisma.JsonNull,
        },
        include: { definition: { include: { word: true } } },
      });
      this.logger.log({
        message: 'card created',
        event: 'card.created',
        method: this.create.name,
        data: { cardId: result.id, userId, deckId, definitionId },
      });
      return result;
    } catch (err: unknown) {
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        if (err.code === 'P2002') {
          this.logger.log({
            message: 'duplicate card',
            event: 'card.duplicate',
            method: this.create.name,
            data: { userId, deckId, definitionId },
          });
          throw new CardAlreadyExistsError();
        }
        if (err.code === 'P2003') {
          const meta = err.meta;
          const fieldName =
            typeof meta?.['field_name'] === 'string' ? meta['field_name'] : '';
          if (fieldName.includes('definition_id')) {
            this.logger.log({
              message: 'definition not found',
              event: 'card.definition_not_found',
              method: this.create.name,
              data: { definitionId },
            });
            throw new DefinitionNotFoundError();
          } else {
            throw new DeckNotFoundError();
          }
        }
      }
      throw err;
    }
  }

  async findManyByUserId(
    userId: string,
    filters: {
      deckId?: string;
      ankiDroidExportStatus?: 'none' | 'pending' | 'completed' | 'failed';
      failureReason?: string;
    } = {},
  ): Promise<CardWithAnkiDroidExport[]> {
    const where: Prisma.CardWhereInput = { userId };

    if (filters.deckId) {
      where.deckId = filters.deckId;
    }

    if (filters.ankiDroidExportStatus === 'none') {
      where.ankidroidExport = { is: null };
    } else if (filters.ankiDroidExportStatus) {
      const exportWhere: Prisma.CardAnkiDroidExportWhereInput = {
        status: filters.ankiDroidExportStatus,
      };
      if (filters.failureReason) {
        exportWhere.failureReason = filters.failureReason;
      }
      where.ankidroidExport = { is: exportWhere };
    } else if (filters.failureReason) {
      where.ankidroidExport = {
        is: { failureReason: filters.failureReason },
      };
    }

    const result = await this.prisma.card.findMany({
      where,
      include: {
        definition: { include: { word: true } },
        ankidroidExport: true,
      },
    });

    this.logger.debug({
      message: 'cards found',
      event: 'card.query_result',
      method: this.findManyByUserId.name,
      data: { userId, filters, count: result.length },
    });

    return result;
  }

  async findOneByIdAndUserId(
    id: string,
    userId: string,
  ): Promise<CardWithAnkiDroidExport | null> {
    return this.prisma.card.findFirst({
      where: { id, userId },
      include: {
        definition: { include: { word: true } },
        ankidroidExport: true,
      },
    });
  }

  async findOwnedOrThrow(
    id: string,
    userId: string,
  ): Promise<CardWithAnkiDroidExport> {
    const card = await this.findOneByIdAndUserId(id, userId);
    if (!card) throw new CardNotFoundError();
    return card;
  }

  findCardsByDefinitionIdsAndUserId(
    definitionIds: string[],
    userId: string,
  ): Promise<
    Array<{ definitionId: string; deck: { id: string; name: string } }>
  > {
    return this.prisma.card.findMany({
      where: { definitionId: { in: definitionIds }, userId },
      select: {
        definitionId: true,
        deck: { select: { id: true, name: true } },
      },
    });
  }

  findCardsWithoutReviewState(
    userId: string,
    deckId?: string,
    limit?: number,
  ): Promise<
    Array<CardWithDefinitionAndWord & { deck: { id: string; name: string } }>
  > {
    return this.prisma.card.findMany({
      where: {
        userId,
        ...(deckId ? { deckId } : {}),
        reviewState: { is: null },
      },
      include: {
        definition: { include: { word: true } },
        deck: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'asc' },
      ...(limit !== undefined ? { take: limit } : {}),
    });
  }
}
