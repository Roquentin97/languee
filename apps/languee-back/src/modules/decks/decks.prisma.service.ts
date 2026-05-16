import { Injectable } from '@nestjs/common';
import type { Deck } from '@prisma/client';
import { PrismaService } from '../core/prisma/prisma.service';

@Injectable()
export class DecksPrismaService {
  constructor(private readonly prisma: PrismaService) {}

  findAllByUserId(userId: string): Promise<Deck[]> {
    return this.prisma.deck.findMany({ where: { userId } });
  }

  findOneByIdAndUserId(id: string, userId: string): Promise<Deck | null> {
    return this.prisma.deck.findFirst({ where: { id, userId } });
  }
}
