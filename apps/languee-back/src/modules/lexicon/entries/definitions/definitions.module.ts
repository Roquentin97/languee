import { Module } from '@nestjs/common';
import { DefinitionService } from './definitions.service';
import { PrismaModule } from '../../../system/core/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [DefinitionService],
  exports: [DefinitionService],
})
export class DefinitionsModule {}
