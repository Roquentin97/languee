import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../system/core/prisma/prisma.module';
import { WordsService } from './words.service';

@Module({
  imports: [PrismaModule],
  providers: [WordsService],
  exports: [WordsService],
})
export class WordsModule {}
