import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CardsModule } from '../cards/cards.module';
import { DictionaryModule } from '../dictionary/dictionary.module';
import { NlpModule } from '../nlp/nlp.module';
import { VocabularyService } from './vocabulary.service';
import { VocabularyController } from './vocabulary.controller';

@Module({
  imports: [DictionaryModule, CardsModule, AuthModule, NlpModule],
  providers: [VocabularyService],
  controllers: [VocabularyController],
})
export class VocabularyModule {}
