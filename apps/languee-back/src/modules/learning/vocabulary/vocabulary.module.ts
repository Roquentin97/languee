import { Module } from '@nestjs/common';
import { AuthModule } from '../../identity/auth/auth.module';
import { CardsModule } from '../cards/cards.module';
import { DictionaryModule } from '../../lexicon/enrichment/dictionary/dictionary.module';
import { NlpModule } from '../../lexicon/enrichment/nlp/nlp.module';
import { WordsModule } from '../../lexicon/entries/words/words.module';
import { DefinitionsModule } from '../../lexicon/entries/definitions/definitions.module';
import { VocabularyService } from './vocabulary.service';
import { VocabularyController } from './vocabulary.controller';
import { LexicalEvaluationService } from './lexical-evaluation.service';

@Module({
  imports: [
    DictionaryModule,
    CardsModule,
    AuthModule,
    NlpModule,
    WordsModule,
    DefinitionsModule,
  ],
  providers: [VocabularyService, LexicalEvaluationService],
  controllers: [VocabularyController],
})
export class VocabularyModule {}
