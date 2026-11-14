import { Module } from '@nestjs/common';
import { PrismaModule } from '../../system/core/prisma/prisma.module';
import { LexicalEvaluationService } from './lexical-evaluation.service';

@Module({
  imports: [PrismaModule],
  providers: [LexicalEvaluationService],
  exports: [LexicalEvaluationService],
})
export class LexicalEvaluationModule {}
