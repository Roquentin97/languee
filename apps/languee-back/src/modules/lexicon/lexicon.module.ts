import { Module } from '@nestjs/common';
import { WordsModule } from './entries/words/words.module';
import { DefinitionsModule } from './entries/definitions/definitions.module';
import { DictionaryModule } from './enrichment/dictionary/dictionary.module';
import { MorphologyModule } from './enrichment/morphology/morphology.module';
import { NlpModule } from './enrichment/nlp/nlp.module';

@Module({
  imports: [
    WordsModule,
    DefinitionsModule,
    DictionaryModule,
    MorphologyModule,
    NlpModule,
  ],
})
export class LexiconModule {}
