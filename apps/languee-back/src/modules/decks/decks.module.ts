import { Module } from '@nestjs/common';
import { PrismaModule } from '../core/prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { DecksService } from './decks.service';
import { DecksPrismaService } from './decks.prisma.service';
import { DecksController } from './decks.controller';
import {
  CREATE_DECK_USE_CASE,
  LIST_DECKS_USE_CASE,
  SHOW_DECK_USE_CASE,
} from './decks.tokens';
import { CreateDeckUseCase } from './application/create-deck.use-case';
import { ListDecksUseCase } from './application/list-decks.use-case';
import { ShowDeckUseCase } from './application/show-deck.use-case';

@Module({
  imports: [PrismaModule, AuthModule],
  providers: [
    DecksService,
    DecksPrismaService,
    { provide: CREATE_DECK_USE_CASE, useClass: CreateDeckUseCase },
    { provide: LIST_DECKS_USE_CASE, useClass: ListDecksUseCase },
    { provide: SHOW_DECK_USE_CASE, useClass: ShowDeckUseCase },
  ],
  controllers: [DecksController],
  exports: [DecksPrismaService],
})
export class DecksModule {}
