import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Deck } from '@prisma/client';
import { PrismaService } from '../core/prisma/prisma.service';
import { DeckAlreadyExistsError, DeckNotFoundError } from './decks.errors';

@Injectable()
export class DecksService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, name: string): Promise<Deck> {
    try {
      return await this.prisma.deck.create({
        data: { userId, name },
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

  findAll(userId: string): Promise<Deck[]> {
    return this.prisma.deck.findMany({ where: { userId } });
  }

  findOneByIdAndUserId(id: string, userId: string): Promise<Deck | null> {
    return this.prisma.deck.findFirst({ where: { id, userId } });
  }

  async findOneOrThrow(id: string, userId: string): Promise<Deck> {
    const deck = await this.findOneByIdAndUserId(id, userId);
    if (deck === null) throw new DeckNotFoundError();
    return deck;
  }
}
