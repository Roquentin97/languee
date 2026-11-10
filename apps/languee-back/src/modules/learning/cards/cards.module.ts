import { MorphologyModule } from '../../lexicon/enrichment/morphology/morphology.module';
import { Module } from '@nestjs/common';
import { PrismaModule } from '../../system/core/prisma/prisma.module';
import { AuthModule } from '../../identity/auth/auth.module';
import { DecksModule } from '../decks/decks.module';
import { DefinitionsModule } from '../../lexicon/entries/definitions/definitions.module';
import { CardsService } from './cards.service';
import { CardsController } from './cards.controller';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    DecksModule,
    DefinitionsModule,
    MorphologyModule,
  ],
  providers: [CardsService],
  controllers: [CardsController],
  exports: [CardsService],
})
export class CardsModule {}
