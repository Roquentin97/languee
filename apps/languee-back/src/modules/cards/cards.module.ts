import { Module } from '@nestjs/common';
import { PrismaModule } from '../core/prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { DecksModule } from '../decks/decks.module';
import { DefinitionsModule } from '../definitions/definitions.module';
import { CardsService } from './cards.service';
import { CardsController } from './cards.controller';

@Module({
  imports: [PrismaModule, AuthModule, DecksModule, DefinitionsModule],
  providers: [CardsService],
  controllers: [CardsController],
  exports: [CardsService],
})
export class CardsModule {}
