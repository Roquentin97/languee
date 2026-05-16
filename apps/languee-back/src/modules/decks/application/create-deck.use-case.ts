import { Injectable } from '@nestjs/common';
import type { Deck } from '@prisma/client';
import { DecksService } from '../decks.service';
import { CreateDeckDto } from '../dto/create-deck.dto';

@Injectable()
export class CreateDeckUseCase {
  constructor(private readonly decksService: DecksService) {}

  execute(userId: string, dto: CreateDeckDto): Promise<Deck> {
    return this.decksService.create(userId, dto.name, dto.language);
  }
}
