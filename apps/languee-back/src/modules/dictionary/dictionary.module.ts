import { Module } from '@nestjs/common';
import { WordsModule } from '../words/words.module';
import { DefinitionsModule } from '../definitions/definitions.module';
import { AuthModule } from '../auth/auth.module';
import { DictionaryService } from './dictionary.service';
import { DictionaryController } from './dictionary.controller';

@Module({
  imports: [WordsModule, DefinitionsModule, AuthModule],
  providers: [DictionaryService],
  controllers: [DictionaryController],
  exports: [DictionaryService],
})
export class DictionaryModule {}
