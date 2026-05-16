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
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../auth/decorators/current-user.decorator';
import { DeckAlreadyExistsError, DeckNotFoundError } from './decks.errors';
import { CreateDeckDto } from './dto/create-deck.dto';
import type { DeckResponseDto } from './dto/deck-response.dto';
import { DecksService } from './decks.service';
import { serializeDeck } from './serializers/deck.serializer';

@Controller('decks')
@UseGuards(JwtAuthGuard)
export class DecksController {
  constructor(private readonly decksService: DecksService) {}

  @Post()
  async create(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: CreateDeckDto,
  ): Promise<DeckResponseDto> {
    try {
      const deck = await this.decksService.create(
        user.userId,
        dto.name,
        dto.language,
      );
      return serializeDeck(deck);
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
    const decks = await this.decksService.findAll(user.userId);
    return decks.map(serializeDeck);
  }

  @Get(':id')
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
