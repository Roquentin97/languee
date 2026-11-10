import { Module } from '@nestjs/common';
import { PrismaModule } from '../../system/core/prisma/prisma.module';
import { AuthModule } from '../../identity/auth/auth.module';
import { CardsModule } from '../cards/cards.module';
import { DecksModule } from '../decks/decks.module';
import { ReviewsService } from './reviews.service';
import { ReviewsController } from './reviews.controller';

@Module({
  imports: [PrismaModule, AuthModule, CardsModule, DecksModule],
  providers: [ReviewsService],
  controllers: [ReviewsController],
  exports: [ReviewsService],
})
export class ReviewsModule {}
