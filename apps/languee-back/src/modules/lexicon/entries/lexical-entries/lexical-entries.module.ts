import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../system/core/prisma/prisma.module';
import { LexicalEntriesService } from './lexical-entries.service';

@Module({
  imports: [PrismaModule],
  providers: [LexicalEntriesService],
  exports: [LexicalEntriesService],
})
export class LexicalEntriesModule {}
