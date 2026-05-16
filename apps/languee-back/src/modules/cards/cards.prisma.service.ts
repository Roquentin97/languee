import { Injectable } from '@nestjs/common';
import { PrismaService } from '../core/prisma/prisma.service';

@Injectable()
export class CardsPrismaService {
  constructor(private readonly prisma: PrismaService) {}

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
