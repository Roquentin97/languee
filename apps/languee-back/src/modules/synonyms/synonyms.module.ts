import { Module } from '@nestjs/common';
import { PrismaModule } from '../core/prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { CardsModule } from '../cards/cards.module';
import { DefinitionsModule } from '../definitions/definitions.module';
import { SynonymsService } from './synonyms.service';
import { SynonymsController } from './synonyms.controller';

@Module({
  imports: [PrismaModule, AuthModule, CardsModule, DefinitionsModule],
  providers: [SynonymsService],
  controllers: [SynonymsController],
  exports: [SynonymsService],
})
export class SynonymsModule {}
