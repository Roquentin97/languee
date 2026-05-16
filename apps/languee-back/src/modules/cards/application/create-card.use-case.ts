import { Injectable } from '@nestjs/common';
import { CardsService, CardWithDefinitionAndWord } from '../cards.service';
import { DecksPrismaService } from '../../decks/decks.prisma.service';
import { CreateCardDto } from '../dto/create-card.dto';
import { DeckOwnershipError } from '../cards.errors';

@Injectable()
export class CreateCardUseCase {
  constructor(
    private readonly cardsService: CardsService,
    private readonly decksPrismaService: DecksPrismaService,
  ) {}

  async execute(
    userId: string,
    dto: CreateCardDto,
  ): Promise<CardWithDefinitionAndWord> {
    const deck = await this.decksPrismaService.findOneByIdAndUserId(
      dto.deckId,
      userId,
    );
    if (deck === null) {
      throw new DeckOwnershipError();
    }

    return this.cardsService.create(userId, dto.deckId, dto.definitionId);
  }
}
