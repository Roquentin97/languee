import { Module } from '@nestjs/common';
import { WordsModule } from '../words/words.module';
import { DefinitionsModule } from '../definitions/definitions.module';
import { AuthModule } from '../auth/auth.module';
import { DictionaryApiAdapter } from './adapters/dictionary-api.adapter';
import { DictionaryService } from './dictionary.service';
import { DictionaryController } from './dictionary.controller';
import { DICTIONARY_API_ADAPTER } from './dictionary.tokens';

@Module({
  imports: [WordsModule, DefinitionsModule, AuthModule],
  providers: [
    { provide: DICTIONARY_API_ADAPTER, useClass: DictionaryApiAdapter },
    DictionaryService,
  ],
  controllers: [DictionaryController],
  exports: [DictionaryService],
})
export class DictionaryModule {}
