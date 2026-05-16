import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Card, Definition, Word } from '@prisma/client';
import { PrismaService } from '../core/prisma/prisma.service';
import { DecksService } from '../decks/decks.service';
import {
  CardAlreadyExistsError,
  DeckOwnershipError,
  DefinitionNotFoundError,
} from './cards.errors';

export type CardWithDefinitionAndWord = Card & {
  definition: Definition & { word: Word };
};

@Injectable()
export class CardsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly decksService: DecksService,
  ) {}

  async create(
    userId: string,
    deckId: string,
    definitionId: string,
  ): Promise<CardWithDefinitionAndWord> {
    const deck = await this.decksService.findOneByIdAndUserId(deckId, userId);
    if (deck === null) throw new DeckOwnershipError();

    try {
      return await this.prisma.card.create({
        data: { userId, deckId, definitionId },
        include: { definition: { include: { word: true } } },
      });
    } catch (err: unknown) {
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        if (err.code === 'P2002') {
          throw new CardAlreadyExistsError();
        }
        if (err.code === 'P2003') {
          const meta = err.meta;
          const fieldName =
            typeof meta?.['field_name'] === 'string' ? meta['field_name'] : '';
          if (fieldName.includes('definition_id')) {
            throw new DefinitionNotFoundError();
          } else {
            throw new DeckOwnershipError();
          }
        }
      }
      throw err;
    }
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
}
