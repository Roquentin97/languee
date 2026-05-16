import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CardsModule } from '../cards/cards.module';
import { DictionaryModule } from '../dictionary/dictionary.module';
import { LOOKUP_VOCABULARY_USE_CASE } from './vocabulary.tokens';
import { LookupVocabularyUseCase } from './application/lookup-vocabulary.use-case';
import { VocabularyController } from './vocabulary.controller';

@Module({
  imports: [DictionaryModule, AuthModule, CardsModule],
  providers: [
    { provide: LOOKUP_VOCABULARY_USE_CASE, useClass: LookupVocabularyUseCase },
  ],
  controllers: [VocabularyController],
})
export class VocabularyModule {}
