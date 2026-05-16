import {
  Body,
  ConflictException,
  Controller,
  NotFoundException,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../auth/decorators/current-user.decorator';
import {
  CardAlreadyExistsError,
  DeckOwnershipError,
  DefinitionNotFoundError,
} from './cards.errors';
import { CreateCardDto } from './dto/create-card.dto';
import type { CardResponseDto } from './dto/card-response.dto';
import { CardsService } from './cards.service';
import { serializeCard } from './serializers/card.serializer';

@Controller('cards')
@UseGuards(JwtAuthGuard)
export class CardsController {
  constructor(private readonly cardsService: CardsService) {}

  @Post()
  async create(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: CreateCardDto,
  ): Promise<CardResponseDto> {
    try {
      const card = await this.cardsService.create(
        user.userId,
        dto.deckId,
        dto.definitionId,
      );
      return serializeCard(card);
    } catch (err: unknown) {
      if (err instanceof DeckOwnershipError) {
        throw new NotFoundException('DECK_NOT_FOUND');
      }
      if (err instanceof CardAlreadyExistsError) {
        throw new ConflictException('CARD_ALREADY_EXISTS');
      }
      if (err instanceof DefinitionNotFoundError) {
        throw new NotFoundException('DEFINITION_NOT_FOUND');
      }
      throw err;
    }
  }
}
