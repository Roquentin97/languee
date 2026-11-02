import { Module } from '@nestjs/common';
import { PrismaModule } from '../core/prisma/prisma.module';
import { WordsService } from './words.service';
import { Normalizer } from './nlp/normalizer';
import { PreLemmatizerStub } from './nlp/pre-lemmatizer.stub';
import { Lemmatizer } from './nlp/lemmatizer/lemmatizer';
import { IrregularTableMechanism } from './nlp/lemmatizer/irregular-table.mechanism';
import { RuleEngineMechanism } from './nlp/lemmatizer/rule-engine.mechanism';
import { PassthroughMechanism } from './nlp/lemmatizer/passthrough.mechanism';

@Module({
  imports: [PrismaModule],
  providers: [
    Normalizer,
    PreLemmatizerStub,
    IrregularTableMechanism,
    RuleEngineMechanism,
    PassthroughMechanism,
    Lemmatizer,
    WordsService,
  ],
  exports: [WordsService],
})
export class WordsModule {}
