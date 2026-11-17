import { Module } from '@nestjs/common';
import { LexicalEntriesModule } from './entries/lexical-entries/lexical-entries.module';
import { DefinitionsModule } from './entries/definitions/definitions.module';
import { DictionaryModule } from './enrichment/dictionary/dictionary.module';
import { MorphologyModule } from './enrichment/morphology/morphology.module';
import { NlpModule } from './enrichment/nlp/nlp.module';

@Module({
  imports: [
    LexicalEntriesModule,
    DefinitionsModule,
    DictionaryModule,
    MorphologyModule,
    NlpModule,
  ],
})
export class LexiconModule {}
