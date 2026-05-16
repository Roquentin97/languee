import {
  Body,
  ConflictException,
  Controller,
  Inject,
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
import { CREATE_CARD_USE_CASE } from './cards.tokens';
import { CreateCardDto } from './dto/create-card.dto';
import { CardResponseDto } from './dto/card-response.dto';
import type { CreateCardUseCase } from './application/create-card.use-case';
import type { CardWithDefinitionAndWord } from './cards.service';

@Controller('cards')
@UseGuards(JwtAuthGuard)
export class CardsController {
  constructor(
    @Inject(CREATE_CARD_USE_CASE)
    private readonly createCardUseCase: CreateCardUseCase,
  ) {}

  @Post()
  async create(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: CreateCardDto,
  ): Promise<CardResponseDto> {
    try {
      const card = await this.createCardUseCase.execute(user.userId, dto);
      return this.toResponseDto(card);
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

  private toResponseDto(card: CardWithDefinitionAndWord): CardResponseDto {
    return {
      id: card.id,
      deckId: card.deckId,
      userId: card.userId,
      definitionId: card.definitionId,
      createdAt: card.createdAt,
      updatedAt: card.updatedAt,
      definition: {
        id: card.definition.id,
        partOfSpeech: card.definition.partOfSpeech,
        definition: card.definition.definition,
        example: card.definition.example ?? null,
        provider: card.definition.provider,
      },
      word: {
        id: card.definition.word.id,
        lemma: card.definition.word.lemma,
        language: card.definition.word.language,
      },
    };
  }
}
