import {
  Body,
  ConflictException,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { Deck } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../auth/decorators/current-user.decorator';
import { DeckAlreadyExistsError, DeckNotFoundError } from './decks.errors';
import {
  CREATE_DECK_USE_CASE,
  LIST_DECKS_USE_CASE,
  SHOW_DECK_USE_CASE,
} from './decks.tokens';
import { CreateDeckDto } from './dto/create-deck.dto';
import { DeckResponseDto } from './dto/deck-response.dto';
import type { CreateDeckUseCase } from './application/create-deck.use-case';
import type { ListDecksUseCase } from './application/list-decks.use-case';
import type { ShowDeckUseCase } from './application/show-deck.use-case';

@Controller('decks')
@UseGuards(JwtAuthGuard)
export class DecksController {
  constructor(
    @Inject(CREATE_DECK_USE_CASE)
    private readonly createDeckUseCase: CreateDeckUseCase,
    @Inject(LIST_DECKS_USE_CASE)
    private readonly listDecksUseCase: ListDecksUseCase,
    @Inject(SHOW_DECK_USE_CASE)
    private readonly showDeckUseCase: ShowDeckUseCase,
  ) {}

  @Post()
  async create(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: CreateDeckDto,
  ): Promise<DeckResponseDto> {
    try {
      const deck = await this.createDeckUseCase.execute(user.userId, dto);
      return this.toResponseDto(deck);
    } catch (err: unknown) {
      if (err instanceof DeckAlreadyExistsError) {
        throw new ConflictException('DECK_ALREADY_EXISTS');
      }
      throw err;
    }
  }

  @Get()
  async findAll(
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<DeckResponseDto[]> {
    const decks = await this.listDecksUseCase.execute(user.userId);
    return decks.map((deck) => this.toResponseDto(deck));
  }

  @Get(':id')
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<DeckResponseDto> {
    try {
      const deck = await this.showDeckUseCase.execute(id, user.userId);
      return this.toResponseDto(deck);
    } catch (err: unknown) {
      if (err instanceof DeckNotFoundError) {
        throw new NotFoundException('DECK_NOT_FOUND');
      }
      throw err;
    }
  }

  private toResponseDto(deck: Deck): DeckResponseDto {
    return {
      id: deck.id,
      userId: deck.userId,
      name: deck.name,
      language: deck.language,
      createdAt: deck.createdAt,
      updatedAt: deck.updatedAt,
    };
  }
}
