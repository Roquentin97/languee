import { Module } from '@nestjs/common';
import { PrismaModule } from '../core/prisma/prisma.module';
import { WordsModule } from '../words/words.module';
import { DefinitionsModule } from '../definitions/definitions.module';
import { AuthModule } from '../auth/auth.module';
import { DEFINITION_API_ADAPTER } from '../definitions/definitions.tokens';
import { DictionaryApiAdapter } from '../definitions/adapters/dictionary-api.adapter';
import {
  NORMALIZER,
  PRE_LEMMATIZER,
  LEMMATIZER,
} from '../pipeline/pipeline.tokens';
import { Normalizer } from '../pipeline/stages/normalizer';
import { PreLemmatizerStub } from '../pipeline/stages/pre-lemmatizer.stub';
import { Lemmatizer } from '../pipeline/stages/lemmatizer/lemmatizer';
import { IrregularTableMechanism } from '../pipeline/stages/lemmatizer/irregular-table.mechanism';
import { RuleEngineMechanism } from '../pipeline/stages/lemmatizer/rule-engine.mechanism';
import { PassthroughMechanism } from '../pipeline/stages/lemmatizer/passthrough.mechanism';
import {
  WORDS_REPOSITORY,
  DEFINITIONS_REPOSITORY,
  LOOKUP_WORD_USE_CASE,
} from './dictionary.tokens';
import { PrismaWordsRepository } from './infrastructure/prisma-words.repository';
import { PrismaDefinitionsRepository } from './infrastructure/prisma-definitions.repository';
import { LookupWordUseCase } from './application/lookup-word.use-case';
import { DictionaryController } from './dictionary.controller';

@Module({
  imports: [PrismaModule, WordsModule, DefinitionsModule, AuthModule],
  providers: [
    { provide: WORDS_REPOSITORY, useClass: PrismaWordsRepository },
    { provide: DEFINITIONS_REPOSITORY, useClass: PrismaDefinitionsRepository },
    { provide: DEFINITION_API_ADAPTER, useClass: DictionaryApiAdapter },
    IrregularTableMechanism,
    RuleEngineMechanism,
    PassthroughMechanism,
    { provide: NORMALIZER, useClass: Normalizer },
    { provide: PRE_LEMMATIZER, useClass: PreLemmatizerStub },
    { provide: LEMMATIZER, useClass: Lemmatizer },
    { provide: LOOKUP_WORD_USE_CASE, useClass: LookupWordUseCase },
  ],
  controllers: [DictionaryController],
})
export class DictionaryModule {}
