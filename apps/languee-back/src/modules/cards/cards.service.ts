import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Card, Definition, Word } from '@prisma/client';
import { PrismaService } from '../core/prisma/prisma.service';
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
  constructor(private readonly prisma: PrismaService) {}

  async create(
    userId: string,
    deckId: string,
    definitionId: string,
  ): Promise<CardWithDefinitionAndWord> {
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
}
