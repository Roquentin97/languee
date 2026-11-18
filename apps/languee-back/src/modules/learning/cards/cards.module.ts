import { LexicalEvaluationModule } from '../../evaluation/lexical/lexical-evaluation.module';
import { MorphologyModule } from '../../lexicon/enrichment/morphology/morphology.module';
import { DictionaryModule } from '../../lexicon/enrichment/dictionary/dictionary.module';
import { NlpModule } from '../../lexicon/enrichment/nlp/nlp.module';
import { Module } from '@nestjs/common';
import { PrismaModule } from '../../system/core/prisma/prisma.module';
import { AuthModule } from '../../identity/auth/auth.module';
import { DecksModule } from '../decks/decks.module';
import { DefinitionsModule } from '../../lexicon/entries/definitions/definitions.module';
import { CardsService } from './cards.service';
import { CardsController } from './cards.controller';

@Module({
  imports: [
    LexicalEvaluationModule,
    PrismaModule,
    AuthModule,
    DecksModule,
    DefinitionsModule,
    MorphologyModule,
    DictionaryModule,
    NlpModule,
  ],
  providers: [CardsService],
  controllers: [CardsController],
  exports: [CardsService],
})
export class CardsModule {}
