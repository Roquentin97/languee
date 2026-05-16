import { Module } from '@nestjs/common';
import { PrismaModule } from '../core/prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { DecksModule } from '../decks/decks.module';
import { CardsService } from './cards.service';
import { CardsPrismaService } from './cards.prisma.service';
import { CardsController } from './cards.controller';
import { CREATE_CARD_USE_CASE } from './cards.tokens';
import { CreateCardUseCase } from './application/create-card.use-case';

@Module({
  imports: [PrismaModule, AuthModule, DecksModule],
  providers: [
    CardsService,
    CardsPrismaService,
    { provide: CREATE_CARD_USE_CASE, useClass: CreateCardUseCase },
  ],
  controllers: [CardsController],
  exports: [CardsPrismaService],
})
export class CardsModule {}
