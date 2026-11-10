import { Module } from '@nestjs/common';
import { PrismaModule } from '../../system/core/prisma/prisma.module';
import { AuthModule } from '../../identity/auth/auth.module';
import { DecksService } from './decks.service';
import { DecksController } from './decks.controller';

@Module({
  imports: [PrismaModule, AuthModule],
  providers: [DecksService],
  controllers: [DecksController],
  exports: [DecksService],
})
export class DecksModule {}
