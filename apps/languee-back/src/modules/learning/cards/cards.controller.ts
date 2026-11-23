import { LogRequestWith } from '../../system/core/interceptors/http-request-log';
import { cardsDetails } from './request-log-policy';
import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { API_V1_PREFIX } from '../../system/core/api-prefix';
import { JwtAuthGuard } from '../../identity/auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../identity/auth/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../../identity/auth/decorators/current-user.decorator';
import { DeckNotFoundError } from '../decks/decks.errors';
import {
  CardAlreadyExistsError,
  DefinitionNotFoundError,
} from './cards.errors';
import { CreateCardDto } from './dto/create-card.dto';
import {
  CardDetailResponseDto,
  CardListItemResponseDto,
  CreateCardsResponseDto,
} from './dto/card-response.dto';
import { ListCardsQueryDto } from './dto/list-cards-query.dto';
import { CardsService } from './cards.service';
import {
  serializeCardDetail,
  serializeCardListItem,
  serializeCards,
} from './serializers/card.serializer';
import { contextInputError } from '../vocabulary/capture-input';
import { rangesCoverCompleteWords } from '../capture/capture-ranges';

@ApiTags('cards')
@ApiBearerAuth('access-token')
@Controller(`${API_V1_PREFIX}/cards`)
@UseGuards(JwtAuthGuard)
export class CardsController {
  constructor(private readonly cardsService: CardsService) {}

  @LogRequestWith(cardsDetails)
  @Get()
  @ApiOperation({ summary: 'List cards for the current user' })
  @ApiOkResponse({ type: [CardListItemResponseDto] })
  @ApiUnauthorizedResponse({ description: 'Not authenticated' })
  async findAll(
    @CurrentUser() user: CurrentUserPayload,
    @Query() query: ListCardsQueryDto,
  ): Promise<CardListItemResponseDto[]> {
    const cards = await this.cardsService.findManyByUserId(user.userId, {
      deckId: query.deckId,
      ankiDroidExportStatus: query.ankiDroidExportStatus,
      failureReason: query.failureReason,
    });
    return cards.map(serializeCardListItem);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a card by id' })
  @ApiOkResponse({ type: CardDetailResponseDto })
  @ApiNotFoundResponse({ description: 'Card not found' })
  @ApiUnauthorizedResponse({ description: 'Not authenticated' })
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<CardDetailResponseDto> {
    const card = await this.cardsService.findOneByIdAndUserId(id, user.userId);
    if (!card) {
      throw new NotFoundException('CARD_NOT_FOUND');
    }
    return serializeCardDetail(card);
  }

  @Post()
  @ApiOperation({
    summary:
      'Save a definition into a deck, generating every applicable card type',
    description:
      'Creates `cloze` and `definition` cards, plus a shared `inflection` card when the word paradigm or optional expression-base lookup resolves an eligible inflection.',
  })
  @ApiBody({ type: CreateCardDto })
  @ApiCreatedResponse({ type: CreateCardsResponseDto })
  @ApiBadRequestResponse({
    description: 'Invalid request, invalid target ranges, or CONTEXT_TOO_LONG',
  })
  @ApiConflictResponse({ description: 'This deck already holds this card' })
  @ApiNotFoundResponse({
    description: 'Deck or definition not found',
  })
  @ApiUnauthorizedResponse({ description: 'Not authenticated' })
  async create(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: CreateCardDto,
  ): Promise<CreateCardsResponseDto> {
    try {
      const contextError = contextInputError(dto.context);
      if (contextError) throw new BadRequestException(contextError);
      this.validateTargetRanges(dto);
      const cards = await this.cardsService.create(
        user.userId,
        dto.deckId,
        dto.definitionId,
        dto.context,
        dto.inflectionForms,
        dto.lookupId,
        dto.targetRanges ?? undefined,
      );
      return serializeCards(cards);
    } catch (err: unknown) {
      if (err instanceof DeckNotFoundError) {
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

  private validateTargetRanges(dto: CreateCardDto): void {
    if (
      dto.targetRanges &&
      !rangesCoverCompleteWords(dto.context, dto.targetRanges)
    )
      throw new BadRequestException('INPUT_INVALID');
  }
}
