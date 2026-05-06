import { Module } from '@nestjs/common';
import { DictionaryApiAdapter } from './adapters/dictionary-api.adapter';
import { DEFINITION_API_ADAPTER } from './definitions.tokens';
import { DefinitionService } from './definitions.service';
import { PrismaModule } from '../core/prisma/prisma.module';
import { WordsModule } from '../words/words.module';

@Module({
  imports: [PrismaModule, WordsModule],
  providers: [
    { provide: DEFINITION_API_ADAPTER, useClass: DictionaryApiAdapter },
    DefinitionService,
  ],
  exports: [DefinitionService],
})
export class DefinitionsModule {}
