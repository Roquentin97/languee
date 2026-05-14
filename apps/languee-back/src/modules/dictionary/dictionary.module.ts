import { Module } from '@nestjs/common';
import { WordsModule } from '../words/words.module';
import { DefinitionsModule } from '../definitions/definitions.module';
import { AuthModule } from '../auth/auth.module';
import { DEFINITION_API_ADAPTER } from '../definitions/definitions.tokens';
import { DictionaryApiAdapter } from '../definitions/adapters/dictionary-api.adapter';
import { LOOKUP_WORD_USE_CASE } from './dictionary.tokens';
import { LookupWordUseCase } from './application/lookup-word.use-case';
import { DictionaryController } from './dictionary.controller';

@Module({
  imports: [WordsModule, DefinitionsModule, AuthModule],
  providers: [
    { provide: DEFINITION_API_ADAPTER, useClass: DictionaryApiAdapter },
    { provide: LOOKUP_WORD_USE_CASE, useClass: LookupWordUseCase },
  ],
  controllers: [DictionaryController],
})
export class DictionaryModule {}
