import {
  Body,
  ConflictException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { API_V1_PREFIX } from '../core/api-prefix';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../auth/decorators/current-user.decorator';
import { DeckAlreadyExistsError, DeckNotFoundError } from './decks.errors';
import { CreateDeckDto } from './dto/create-deck.dto';
import { DeckResponseDto } from './dto/deck-response.dto';
import { DecksService } from './decks.service';
import { serializeDeck } from './serializers/deck.serializer';

@ApiTags('decks')
@ApiBearerAuth('access-token')
@Controller(`${API_V1_PREFIX}/decks`)
@UseGuards(JwtAuthGuard)
export class DecksController {
  constructor(private readonly decksService: DecksService) {}

  @Post()
  @ApiOperation({ summary: 'Create a deck' })
  @ApiBody({ type: CreateDeckDto })
  @ApiCreatedResponse({ type: DeckResponseDto })
  @ApiConflictResponse({ description: 'Deck already exists' })
  @ApiUnauthorizedResponse({ description: 'Not authenticated' })
  async create(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: CreateDeckDto,
  ): Promise<DeckResponseDto> {
    try {
      const deck = await this.decksService.create(user.userId, dto.name);
      return serializeDeck(deck);
    } catch (err: unknown) {
      if (err instanceof DeckAlreadyExistsError) {
        throw new ConflictException('DECK_ALREADY_EXISTS');
      }
      throw err;
    }
  }

  @Get()
  @ApiOperation({ summary: 'List decks for the current user' })
  @ApiOkResponse({ type: [DeckResponseDto] })
  @ApiUnauthorizedResponse({ description: 'Not authenticated' })
  async findAll(
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<DeckResponseDto[]> {
    const decks = await this.decksService.findAll(user.userId);
    return decks.map(serializeDeck);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a deck by id' })
  @ApiParam({ name: 'id', type: String, example: 'deck_123' })
  @ApiOkResponse({ type: DeckResponseDto })
  @ApiNotFoundResponse({ description: 'Deck not found' })
  @ApiUnauthorizedResponse({ description: 'Not authenticated' })
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<DeckResponseDto> {
    try {
      const deck = await this.decksService.findOneOrThrow(id, user.userId);
      return serializeDeck(deck);
    } catch (err: unknown) {
      if (err instanceof DeckNotFoundError) {
        throw new NotFoundException('DECK_NOT_FOUND');
      }
      throw err;
    }
  }
}
