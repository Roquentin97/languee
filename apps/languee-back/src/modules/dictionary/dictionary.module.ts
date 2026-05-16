import { Module } from '@nestjs/common';
import { WordsModule } from '../words/words.module';
import { DefinitionsModule } from '../definitions/definitions.module';
import { AuthModule } from '../auth/auth.module';
import { LOOKUP_WORD_USE_CASE } from './dictionary.tokens';
import { LookupWordUseCase } from './application/lookup-word.use-case';
import { DictionaryController } from './dictionary.controller';

@Module({
  imports: [WordsModule, DefinitionsModule, AuthModule],
  providers: [
    LookupWordUseCase,
    { provide: LOOKUP_WORD_USE_CASE, useExisting: LookupWordUseCase },
  ],
  controllers: [DictionaryController],
  exports: [LookupWordUseCase],
})
export class DictionaryModule {}
