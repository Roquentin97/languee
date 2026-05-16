import { Module } from '@nestjs/common';
import { PrismaModule } from '../core/prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { DecksService } from './decks.service';
import { DecksController } from './decks.controller';

@Module({
  imports: [PrismaModule, AuthModule],
  providers: [DecksService],
  controllers: [DecksController],
  exports: [DecksService],
})
export class DecksModule {}
