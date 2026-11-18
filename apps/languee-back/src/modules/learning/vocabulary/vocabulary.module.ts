import { Module } from '@nestjs/common';
import { AuthModule } from '../../identity/auth/auth.module';
import { CardsModule } from '../cards/cards.module';
import { DictionaryModule } from '../../lexicon/enrichment/dictionary/dictionary.module';
import { NlpModule } from '../../lexicon/enrichment/nlp/nlp.module';
import { LexicalEntriesModule } from '../../lexicon/entries/lexical-entries/lexical-entries.module';
import { DefinitionsModule } from '../../lexicon/entries/definitions/definitions.module';
import { VocabularyService } from './vocabulary.service';
import { VocabularyController } from './vocabulary.controller';
import { LexicalEvaluationModule } from '../../evaluation/lexical/lexical-evaluation.module';

@Module({
  imports: [
    LexicalEvaluationModule,
    DictionaryModule,
    CardsModule,
    AuthModule,
    NlpModule,
    LexicalEntriesModule,
    DefinitionsModule,
  ],
  providers: [VocabularyService],
  controllers: [VocabularyController],
})
export class VocabularyModule {}
