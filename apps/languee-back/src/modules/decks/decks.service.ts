import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Deck } from '@prisma/client';
import { PrismaService } from '../core/prisma/prisma.service';
import { DeckAlreadyExistsError } from './decks.errors';

@Injectable()
export class DecksService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, name: string, language: string): Promise<Deck> {
    try {
      return await this.prisma.deck.create({
        data: { userId, name, language },
      });
    } catch (err: unknown) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new DeckAlreadyExistsError();
      }
      throw err;
    }
  }
}
